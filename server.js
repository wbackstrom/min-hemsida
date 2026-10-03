const http = require("http");


const server = http.createServer((req, res) => {
    console.log(req.method, req.url);

    console.log("CF-Connecting-IP:", req.headers["cf-connecting-ip"]);
    console.log("X-Forwarded-For:", req.headers["x-forwarded-for"]);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === "POST" && req.url === "/api/chat") {
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