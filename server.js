const http = require("http");
const net = require("net");

const allowedOrigins = new Set([
    "https://wbackstrom.github.io",
    "http://localhost:8000"
]);

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const clientRequests = new Map();

function getClientIp(req) {
    const address = process.env.RENDER === "true"
        ? req.headers["cf-connecting-ip"]
        : req.socket.remoteAddress;

    if (typeof address !== "string" || !net.isIP(address)) {
        return "unknown-client";
    }

    return net.isIP(address) === 6
        ? new URL(`http://[${address}]/`).hostname.slice(1, -1)
        : address;
}

setInterval(() => {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    for (const [ip, timestamps] of clientRequests) {
        const recent = timestamps.filter(timestamp => timestamp > cutoff);
        if (recent.length === 0) {
            clientRequests.delete(ip);
        } else {
            clientRequests.set(ip, recent);
        }
    }
}, RATE_WINDOW_MS).unref();


const server = http.createServer((req, res) => {
    console.log(req.method, req.url);

    const origin = req.headers.origin;
    res.setHeader("Vary", "Origin");

    if (origin !== undefined && allowedOrigins.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }

    if (req.url === "/api/chat" && origin !== undefined && !allowedOrigins.has(origin)) {
        res.writeHead(403, {
            "Content-Type": "application/json; charset=utf-8"
        });
        res.end(JSON.stringify({
            error: "Den här webbplatsen får inte använda chatten."
        }));
        req.resume();
        return;
    }

    if (req.method === "OPTIONS") {
        if (req.url === "/api/chat" && origin !== undefined) {
            res.setHeader("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
            const requestedMethod = req.headers["access-control-request-method"];
            const requestedHeaders = req.headers["access-control-request-headers"];
            const headersAllowed = requestedHeaders === undefined ||
                (typeof requestedHeaders === "string" && requestedHeaders.split(",")
                    .every(header => header.trim().toLowerCase() === "content-type"));

            if (requestedMethod !== "POST" || !headersAllowed) {
                res.writeHead(403, {
                    "Content-Type": "application/json; charset=utf-8"
                });
                res.end(JSON.stringify({
                    error: "Begärd metod eller header är inte tillåten för chatten."
                }));
                return;
            }

            res.setHeader("Access-Control-Allow-Methods", "POST");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        }
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === "POST" && req.url === "/api/chat") {
        const ip = getClientIp(req);
        const now = Date.now();
        const timestamps = (clientRequests.get(ip) || [])
            .filter(timestamp => timestamp > now - RATE_WINDOW_MS);

        if (timestamps.length >= RATE_LIMIT) {
            res.writeHead(429, {
                "Content-Type": "application/json; charset=utf-8",
                "Retry-After": String(Math.ceil((timestamps[0] + RATE_WINDOW_MS - now) / 1000))
            });
            res.end(JSON.stringify({
                error: "Du har skickat för många frågor. Max 10 anrop per minut. Försök igen om en stund."
            }));
            req.resume();
            return;
        }

        timestamps.push(now);
        clientRequests.set(ip, timestamps);

        let body = "";

        req.on("data", (chunk) => {
            body += chunk;
        });

        req.on("end", async () => {
            console.log("Mottagen data:", body);
            let data;

            try {
                data = JSON.parse(body);
            } catch (error) {
                res.writeHead(400, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    error: "Ogiltig JSON"
                }));

                return;
            }

            if (!data.question || !data.question.trim()) {
                res.writeHead(400, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    error: "Frågan saknas"
                }));

                return;
            }
            if (data.question.length > 2000) {
                res.writeHead(400, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    error: "Frågan är för lång. Du kan skriva högst 2000 tecken."
                }));

                return;
            }

            if (data.previousResponseId !== undefined &&
                (typeof data.previousResponseId !== "string" || !data.previousResponseId.trim())) {
                res.writeHead(400, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    error: "Ogiltigt svar-ID"
                }));

                return;
            }

            try {
                const aiResponse = await fetch("https://api.openai.com/v1/responses", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: "gpt-6-luna",
                        input: data.question,
                        store: true,
                        previous_response_id: data.previousResponseId
                    })
                });

                const aiData = await aiResponse.json();
                if (!aiResponse.ok) {
                    console.error("OpenAI-fel:", aiResponse.status, aiData.error?.message);
                    throw new Error(`OpenAI svarade med ${aiResponse.status}`);
                }
                const message = aiData.output.find((item) => item.type === "message");
                const textContent = message?.content.find((item) => item.type === "output_text");
                const answer = textContent?.text;

                if (!answer) {
                    throw new Error("AI-svaret innehöll ingen text");
                }

                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ answer: answer, responseId: aiData.id }));
            } catch (error) {
                console.error("Fel vid AI-anrop:", error.message);

                res.writeHead(500, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    error: "Kunde inte hämta svar från AI"
                }));
            }
        });

        return;
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Hej från min backend!");
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servern kör på port ${PORT}`);


});