const express = require('express');
const app = express();

const port = process.env.PORT || 8080;

app.get('/', function (req, res) {
    res.send('Hello World');
})

app.listen(port, () => {
    console.log(`Education app listening at http://localhost:${port}`);
})