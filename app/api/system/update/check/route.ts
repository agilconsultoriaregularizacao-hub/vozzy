import { NextRequest, NextResponse } from 'next/server';
import { CURRENT_VERSION } from '@/lib/version';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // We check for updates relative to the UPSTREAM repository
    // This is where the core template is maintained
    const owner = process.env.GITHUB_UPSTREAM_OWNER || 'VozzyUp';
    const repo = process.env.GITHUB_UPSTREAM_REPO || 'vozzysmart_template';
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      console.error('[UPDATE-CHECK] Missing GITHUB_TOKEN');
      return NextResponse.json({ 
        error: 'Variável GITHUB_TOKEN ausente no Vercel.',
        configured: false 
      }, { status: 500 });
    }

    // Fetch latest tags/releases from GitHub Upstream
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/tags`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'VozzySmart-Update-Checker'
      },
      next: { revalidate: 60 } // Reduced cache to 60 seconds for easier testing
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[UPDATE-CHECK] GitHub API error:', errorData);
      return NextResponse.json({ 
        error: `Erro ao consultar GitHub: ${errorData.message || response.statusText }`,
        status: response.status
      }, { status: response.status });
    }

    const tags = await response.json();
    
    if (!tags || tags.length === 0) {
      return NextResponse.json({
        available: false,
        currentVersion: CURRENT_VERSION,
        latestVersion: CURRENT_VERSION,
        message: 'Nenhuma versão encontrada no repositório upstream.'
      });
    }

    // Assume the first tag is the latest
    // Remove 'v' prefix if present for comparison
    const latestTagName = tags[0].name;
    const latestVersion = latestTagName.replace(/^v/, ''); 
    
    // Simple direct comparison
    const isNewer = latestVersion !== CURRENT_VERSION;

    return NextResponse.json({
      available: isNewer,
      currentVersion: CURRENT_VERSION,
      latestVersion: latestVersion,
      tagName: latestTagName,
      configured: true,
      upstream: `${owner}/${repo}`
    });

  } catch (error) {
    console.error('[UPDATE-CHECK] Unhandled error:', error);
    return NextResponse.json({ error: 'Erro interno ao verificar atualizações' }, { status: 500 });
  }
}
