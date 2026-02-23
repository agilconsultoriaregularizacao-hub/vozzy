import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Attempt to detect repo from Vercel system variables, or fallback to custom env vars
    const owner = process.env.GITHUB_OWNER || process.env.VERCEL_GIT_REPO_OWNER;
    const repo = process.env.GITHUB_REPO || process.env.VERCEL_GIT_REPO_SLUG;
    const token = process.env.GITHUB_TOKEN;
    const upstreamBranch = process.env.GITHUB_UPSTREAM || 'main';

    if (!token) {
      return NextResponse.json({ 
        error: 'Variável GITHUB_TOKEN ausente no Vercel.' 
      }, { status: 500 });
    }

    if (!owner || !repo) {
      return NextResponse.json({ 
        error: 'Não foi possível detectar o repositório automático. Por favor, configure GITHUB_OWNER e GITHUB_REPO no Vercel ou ative as System Environment Variables.' 
      }, { status: 500 });
    }

    // Call GitHub Merge Upstream API
    // POST /repos/{owner}/{repo}/merge-upstream
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/merge-upstream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'VozzySmart-Update-Apply'
      },
      body: JSON.stringify({
        branch: upstreamBranch 
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[UPDATE-APPLY] GitHub API error:', data);
      return NextResponse.json({ 
        error: data.message || 'Erro ao sincronizar com upstream',
        details: data
      }, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      message: 'Sincronização iniciada com sucesso. O Vercel deve iniciar um novo deploy em instantes.',
      data
    });

  } catch (error) {
    console.error('[UPDATE-APPLY] Unhandled error:', error);
    return NextResponse.json({ error: 'Erro interno ao aplicar atualização' }, { status: 500 });
  }
}
