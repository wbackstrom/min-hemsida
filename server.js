const http = require("http");


const server = http.createServer((req, res) => {
    console.log(req.method, req.url);

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
            const data = JSON.parse(body);
            const aiResponse = await fetch("https://api.openai.com/v1/responses", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: "gpt-6-luna",
                    input: data.question
                })
            });

            const aiData = await aiResponse.json();
            const answer = aiData.output[0].content[0].text;

            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ answer: answer }));
        });

        return;
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Hej från min backend!");
});
server.listen(3000, () => {
    console.log("Servern kör på http://localhost:3000");


});