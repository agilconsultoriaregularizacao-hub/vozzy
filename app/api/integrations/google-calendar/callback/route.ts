import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeCodeForTokens,
  fetchGoogleAccountEmail,
  saveTokens,
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

    // 2. Busca e-mail da conta conectada
    console.log('[google-calendar] callback: buscando email da conta...')
    const accountEmail = await fetchGoogleAccountEmail(tokens.accessToken)

    // 3. Busca o calendário primário diretamente com o accessToken em memória
    //    (evita chamar ensureAccessToken que re-lê do banco logo após a escrita,
    //     o que causava o erro "Google Calendar nao conectado")
    console.log('[google-calendar] callback: buscando calendario primario...')
    const calListRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
    const calListJson = await calListRes.json().catch(() => ({}))
    if (!calListRes.ok) {
      const msg = (calListJson as any)?.error?.message || 'Falha ao listar calendarios'
      throw new Error(msg)
    }
    const items: any[] = Array.isArray((calListJson as any).items) ? (calListJson as any).items : []
    const primary = items.find((c: any) => c.primary) || items[0]
    if (!primary) throw new Error('Nenhum calendario encontrado')

    const config = {
      calendarId: String(primary.id),
      calendarSummary: String(primary.summary || ''),
      calendarTimeZone: primary.timeZone ? String(primary.timeZone) : null,
      connectedAt: new Date().toISOString(),
      accountEmail: accountEmail || null,
    }
    await saveCalendarConfig(config)
    console.log('[google-calendar] callback: calendario configurado:', config.calendarId)

    // 4. Configura webhook de notificações (nao-fatal: falha aqui nao impede a conexao)
    try {
      await ensureCalendarChannel(config.calendarId)
      console.log('[google-calendar] callback: webhook channel configurado com sucesso')
    } catch (channelError) {
      console.warn('[google-calendar] callback: falha ao configurar webhook (nao-fatal):', channelError)
    }

    // Forcar path local — nunca permitir URLs absolutas (previne open redirect)
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
