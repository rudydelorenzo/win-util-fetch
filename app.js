const fs = require('fs');
const path = require('path');
const util = require('util');
const ProgressBar = require('progress');
const fetch = require('node-fetch');
const stream = require('stream');

const pipeline = util.promisify(stream.pipeline);

async function download(url) {
    let filename = path.basename(url);
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

async function main() {
    await download("https://download.cpuid.com/cpu-z/cpu-z_1.95-en.zip");
    console.log("All Done! :)");
}

main()