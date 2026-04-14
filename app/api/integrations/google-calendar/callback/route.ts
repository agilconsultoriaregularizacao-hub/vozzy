import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeCodeForTokens,
  fetchGoogleAccountEmail,
  saveTokens,
  buildDefaultCalendarConfig,
  saveCalendarConfig,
  ensureCalendarChannel,
} from '@/lib/google-calendar'

const STATE_COOKIE = 'gc_oauth_state'
const RETURN_COOKIE = 'gc_oauth_return'

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const cookieState = request.cookies.get(STATE_COOKIE)?.value
    const returnTo = request.cookies.get(RETURN_COOKIE)?.value || '/settings'

    if (!code) {
      return NextResponse.json({ error: 'Codigo OAuth ausente' }, { status: 400 })
    }
    if (!state || !cookieState || state !== cookieState) {
      return NextResponse.json({ error: 'Estado OAuth invalido' }, { status: 400 })
    }

    // 1. Troca o code pelos tokens de acesso
    console.log('[google-calendar] callback: trocando code por tokens...')
    const tokens = await exchangeCodeForTokens(code)
    console.log('[google-calendar] callback: tokens obtidos, salvando...')
    await saveTokens(tokens)

    // 2. Busca e-mail e configura calendário primário
    console.log('[google-calendar] callback: buscando dados do calendário...')
    const accountEmail = await fetchGoogleAccountEmail(tokens.accessToken)
    const config = await buildDefaultCalendarConfig(accountEmail, tokens)
    await saveCalendarConfig(config)
    console.log('[google-calendar] callback: calendário configurado:', config.calendarId)

    // 3. Configura webhook de notificações (não-fatal: falha aqui não impede a conexão)
    try {
      await ensureCalendarChannel(config.calendarId, tokens)
      console.log('[google-calendar] callback: webhook channel configurado com sucesso')
    } catch (channelError) {
      console.warn('[google-calendar] callback: falha ao configurar webhook channel (não-fatal):', channelError)
    }

    // Forçar path local — nunca permitir URLs absolutas (previne open redirect)
    const safePath = returnTo.startsWith('/') ? returnTo : '/settings'
    const absoluteReturnUrl = `${url.origin}${safePath}`

    const response = NextResponse.redirect(absoluteReturnUrl)
    response.cookies.delete(STATE_COOKIE)
    response.cookies.delete(RETURN_COOKIE)
    return response
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[google-calendar] callback error:', errorMessage, error)
    return NextResponse.json({
      error: 'Falha ao concluir OAuth',
      details: errorMessage
    }, { status: 500 })
  }
}
