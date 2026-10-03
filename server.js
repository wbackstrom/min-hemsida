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

        req.on("end", () => {
            console.log("Mottagen data:", body);
            const data = JSON.parse(body);
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ answer: `Du frågade: ${data.question}` }));
        });

        return;
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Hej från min backend!");
});
server.listen(3000, () => {
    console.log("Servern kör på http://localhost:3000");


});