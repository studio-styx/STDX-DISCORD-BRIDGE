import fastify from "fastify";
import { Redis } from "@upstash/redis";
import awsLambdaFastify from "@fastify/aws-lambda";

const app = fastify();

type FetchResult<T> = 
| {
    success: true,
    data: T
}
| {
    success: false,
    error: string,
    status: number
}

type RestOAuth2 = {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
}

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
}

const redis = new Redis({
    url: process.env.REDIS_URL as string,
    token: process.env.REDIS_TOKEN as string,
});

function renderPage(type: "success" | "error", title: string, description: string, details?: string) {
    const bgColor = type === "success" ? "#43b581" : "#f04747";
    const icon = type === "success" ? "✅" : "❌";

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body {
                background-color: #36393f; /* Fundo do Discord */
                color: #dcddde;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
            }
            .card {
                background-color: #2f3136;
                padding: 40px;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                text-align: center;
                max-width: 400px;
                width: 90%;
                border-top: 5px solid ${bgColor};
            }
            h1 {
                color: #ffffff;
                margin-bottom: 10px;
                font-size: 24px;
            }
            .icon {
                font-size: 48px;
                margin-bottom: 20px;
            }
            p {
                font-size: 16px;
                line-height: 1.5;
            }
            .details {
                margin-top: 20px;
                padding: 10px;
                background-color: #202225;
                border-radius: 4px;
                font-family: monospace;
                color: #ed4245;
                font-size: 14px;
                word-break: break-all;
            }
            button {
                margin-top: 25px;
                background-color: #5865F2; /* Blurple do Discord */
                color: white;
                border: none;
                padding: 10px 20px;
                font-size: 16px;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            button:hover {
                background-color: #4752c4;
            }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon">${icon}</div>
            <h1>${title}</h1>
            <p>${description}</p>
            ${details ? `<div class="details">${details}</div>` : ''}
            <button onclick="window.close()">Fechar esta aba</button>
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
    }

    const response = await fetch("https://discord.com/api/v10/oauth2/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(fetchBody).toString(),
    });

    if (!response.ok) {
        return {
            success: false,
            error: "Falha ao obter o token de acesso.",
            status: response.status,
        };
    }

    const data = await response.json() as RestOAuth2;
    return {
        success: true,
        data,
    };
}

app.get("/", async (request, reply) => {
    return { status: "online", message: "API funcionando!" };
});

app.get("/api", async (request, reply) => {
    return { hello: "world" };
});

app.get("/api/auth/redirect", async (req, reply) => {
    const { code } = req.query as { code?: string };
    
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
        headers: {
            Authorization: `Bearer ${tokenResult.data.access_token}`,
        },
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
    };
    await redis.publish("auth:updates", JSON.stringify(payload));

    return reply.status(200).send(
        renderPage("success", "Tudo certo!", "A autorização foi concluída com sucesso. Seu e-mail já foi enviado de forma segura para o sistema.", "Você já pode voltar para o Discord.")
    );
});

const proxy = awsLambdaFastify(app);

let isReady = false;

export default async function handler(req: any, res: any) {
    if (!isReady) {
        await app.ready();
        isReady = true;
    }
    
    app.server.emit('request', req, res);
}