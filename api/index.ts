import fastify from "fastify";
import { Redis } from "@upstash/redis";

const app = fastify({ logger: true });

type FetchResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; status: number };

type RestOAuth2 = {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
};

type DiscordUser = {
    id: string;
    username: string;
    avatar: string;
    discriminator: string;
    public_flags: number;
    flags: number;
    email: string;
    verified: boolean;
    premium_type: number;
    locale: string;
};

const redis = new Redis({
    url: process.env.REDIS_URL as string,
    token: process.env.REDIS_TOKEN as string,
});

function renderPage(type: "success" | "error", title: string, description: string, details?: string) {
    const isSuccess = type === "success";

    const primaryColor = isSuccess ? "#10B981" : "#EF4444";
    const bgColor = "#0f172a";
    const cardColor = "#1e293b";

    const iconSvg = isSuccess
        ? `<svg xmlns="http://www.w3.org/2000/svg" class="icon success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" class="icon error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
        <style>
            :root {
                --primary: ${primaryColor};
                --bg: ${bgColor};
                --card: ${cardColor};
                --text-main: #f8fafc;
                --text-muted: #94a3b8;
                --border: #334155;
            }

            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            body {
                background-color: var(--bg);
                color: var(--text-main);
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                padding: 20px;
            }

            .card {
                background-color: var(--card);
                padding: 40px 32px;
                border-radius: 16px;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                text-align: center;
                max-width: 420px;
                width: 100%;
                border: 1px solid var(--border);
                border-top: 4px solid var(--primary);
                
                /* Animação de entrada */
                animation: slideUp 0.5s ease-out forwards;
                opacity: 0;
                transform: translateY(20px);
            }

            @keyframes slideUp {
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .icon-container {
                display: flex;
                justify-content: center;
                margin-bottom: 24px;
            }

            .icon {
                width: 64px;
                height: 64px;
                color: var(--primary);
                /* Efeito de brilho suave na cor do ícone */
                filter: drop-shadow(0 0 12px ${primaryColor}40);
            }

            h1 {
                font-size: 24px;
                font-weight: 600;
                margin-bottom: 12px;
                letter-spacing: -0.025em;
            }

            .description {
                font-size: 15px;
                color: var(--text-muted);
                line-height: 1.6;
                margin-bottom: 24px;
            }

            .details {
                margin-bottom: 24px;
                padding: 16px;
                background-color: rgba(0, 0, 0, 0.25);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                color: #e2e8f0;
                font-size: 13px;
                text-align: left;
                word-break: break-all;
                max-height: 150px;
                overflow-y: auto;
            }

            /* Estilização da instrução de saída */
            .close-instruction {
                margin-top: 8px;
                padding-top: 24px;
                border-top: 1px solid var(--border);
                font-size: 14px;
                color: var(--text-muted);
                font-weight: 500;
            }

            .close-instruction span {
                display: block;
                margin-top: 4px;
                font-size: 12px;
                opacity: 0.7;
            }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon-container">
                ${iconSvg}
            </div>
            <h1>${title}</h1>
            <p class="description">${description}</p>
            
            ${details ? `<div class="details">${details}</div>` : ''}
            
            <div class="close-instruction">
                Você já pode fechar esta aba.
                <span>${isSuccess ? 'Ação concluída com sucesso.' : 'Verifique os detalhes e tente novamente.'}</span>
            </div>
        </div>
    </body>
    </html>
    `;
}

async function userAccessToken(code: string): Promise<FetchResult<RestOAuth2>> {
    const fetchBody: Record<string, string> = {
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.REDIRECT_URI as string,
        client_id: process.env.CLIENT_ID as string,
        client_secret: process.env.CLIENT_SECRET as string,
    };

    const response = await fetch("https://discord.com/api/v10/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fetchBody).toString(),
    });

    if (!response.ok) {
        const responseString = JSON.stringify(await response.json());
        return { success: false, error: "Falha ao obter o token de acesso: " + responseString, status: response.status };
    }

    const data = await response.json() as RestOAuth2;
    return { success: true, data };
}

app.get("/", async (request, reply) => {
    return { status: "online", message: "API funcionando na Vercel!" };
});

app.get("/api", async (request, reply) => {
    return { hello: "world" };
});

app.get("/api/auth/redirect", async (req, reply) => {
    const { code, state } = req.query as { code?: string, state?: string };

    reply.type("text/html; charset=utf-8");

    if (!code) {
        return reply.status(400).send(
            renderPage("error", "Erro de Autorização", "O código de autorização não foi fornecido pela URL.")
        );
    }

    const tokenResult = await userAccessToken(code);
    if (!tokenResult.success) {
        return reply.status(tokenResult.status).send(
            renderPage("error", "Erro na Autenticação", "Não foi possível validar seu login com o Discord.", `Detalhe: ${tokenResult.error} (Status ${tokenResult.status})`)
        );
    }

    const userResult = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${tokenResult.data.access_token}` },
    });

    if (!userResult.ok) {
        return reply.status(userResult.status).send(
            renderPage("error", "Erro ao buscar dados", "O login foi feito, mas falhamos ao ler seu perfil do Discord.", `Status: ${userResult.status}`)
        );
    }

    const userData = await userResult.json() as DiscordUser;

    const payload = {
        id: userData.id,
        email: userData.email,
        interaction_token: state,
    };
    await redis.publish("auth:updates", JSON.stringify(payload));

    return reply.status(200).send(
        renderPage("success", "Tudo certo!", "A autorização foi concluída com sucesso. Seu e-mail já foi enviado de forma segura para o sistema.", "Você já pode voltar para o Discord.")
    );
});

let isReady = false;

export default async function handler(req: any, res: any) {
    if (!isReady) {
        await app.ready();
        isReady = true;
    }

    app.server.emit('request', req, res);
}