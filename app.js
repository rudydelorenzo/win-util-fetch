const fs = require('fs');
const path = require('path');
const util = require('util');
const ProgressBar = require('progress');
const fetch = require('node-fetch');
const stream = require('stream');
const DOMParser = require('jsdom');

const sessID = "12312edfhjbasd";    // TODO: generate randomly each run
const pipeline = util.promisify(stream.pipeline);

async function download(url, filename) {
    if (!filename) filename = path.basename(url);    // handles optional filename argument
    const file = fs.createWriteStream(filename);

    let response, body;

    try {
        response = await fetch(url);
        body = response.body;
    } catch (err) {
        file.close();
        fs.unlinkSync(filename); // delete file in case of failure
        console.log("\x1b[31m%s\x1b[0m", "✗ | Download failed :(");
        console.error(err);
        return
    }

    let totalsize = parseInt(response.headers.get('content-length'), 10);
    let downloaded = 0;             // not in use at the moment

    let pb = new ProgressBar(`* | ${filename}\t :percent [:bar] :rate b/s ETA :etas`, {
        complete: '=',
        head: '>',
        incomplete: ' ',
        width: 30,
        total: totalsize
    });

    response.body.on('data', (chunk) => {
        downloaded += chunk.length; // not in use at the moment
        pb.tick(chunk.length);
    });

    try {
        const file = fs.createWriteStream(filename);
        await pipeline(body, file);
    } catch (err) {
        file.close();
        fs.unlinkSync(filename); // delete file in case of failure
        console.log("\x1b[31m%s\x1b[0m", "✗ | Download failed :(");
        console.error(err);
        return
    }

    file.close();
    console.log("\x1b[32m%s\x1b[0m", `✔ | Downloaded ${filename}! (${totalsize})`);
}

async function getUtil(url) {
    // find div containing links
    // go to download page
    // go to common download endpoint and intercept 302 location
    let opts = {
        headers: {
            cookie: sessID
        },
        redirect: "manual"
    };

    let address, response;

    try {
        response = await fetch("https://www.guru3d.com/index.php?ct=files&action=download&", opts);
        address = response.headers.get("location");
        console.log(address);
    } catch (err) {
        console.error(err);
        return
    }

    // download from location address
    await download(address)
}

async function main() {
    await getUtil("");
    console.log("All Done! :)");
}

main()