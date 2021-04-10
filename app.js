'use strict'

const fs = require('fs');
const path = require('path');
const util = require('util');
const ProgressBar = require('progress');
const fetch = require('node-fetch');
const stream = require('stream');
const DOMParser = require('jsdom');

//TODO: Complete JSON file
//TODO: Comment code
//TODO: Wrap in .command and .bat file
//TODO: Use 10GBit servers
//TODO: Move to TypeScript

const dirname = "TOOLS"
const pipeline = util.promisify(stream.pipeline);

let locations;
try {
    locations = JSON.parse(fs.readFileSync("locations.json"));
} catch (err) {
    console.log("\x1b[31m%s\x1b[0m", "✗ | Couldn't read locations.json, aborting...");
    console.error(err);
    return
}

if (!fs.existsSync(dirname)){
    fs.mkdirSync(dirname);
}

let opts = {
    headers: {
        Host: "www.guru3d.com",
        Accept: "*/*",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 11_1_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36"
    },
    redirect: "manual"
};

async function download(url, filename) {
    if (!filename) filename = path.basename(url);    // handles optional filename argument
    const file = fs.createWriteStream(path.join(dirname, filename));

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

    let totalSize = parseInt(response.headers.get('content-length'), 10);
    let downloaded = 0;             // not in use at the moment

    let pb = new ProgressBar(`* | ${filename}\t :percent [:bar] :rate b/s ETA :etas`, {
        complete: '=',
        head: '>',
        incomplete: ' ',
        width: 30,
        total: totalSize
    });

    response.body.on('data', (chunk) => {
        downloaded += chunk.length; // not in use at the moment
        pb.tick(chunk.length);
    });

    try {
        await pipeline(body, file);
    } catch (err) {
        file.close();
        fs.unlinkSync(filename); // delete file in case of failure
        throw err;
    }

    file.close();
    return {filename: filename, size: totalSize};
}

async function getUtil(url, name) {
    if (!name) name = url;

    // find div containing links
    console.log(`* | Now downloading ${name}...`);
    let page = await fetch(url, opts);
    opts.headers.Cookie = newCookie(page.headers);  // set PHPSESSID if a new one was sent
    page = await page.text();
    let downloadPage = new DOMParser.JSDOM(page).window.document.body.getElementsByClassName("lower-greek")[0].children[0].href;

    // go to download page
    await fetch(downloadPage, opts)

    // go to common download endpoint and intercept 302 location
    let address, response;
    try {
        response = await fetch(`https://www.guru3d.com/index.php?ct=files&action=download&`, opts);
        address = response.headers.get("location");
        if (!address) throw new Error("Location header was empty, download not attempted...");
    } catch (err) {
        console.error(err);
        return
    }

    // download from location address
    try {
        let {filename, size} = await download(address)
        console.log("\x1b[32m%s\x1b[0m", `✔ | Downloaded ${filename}! (${size})`);
    } catch (err) {
        console.log("\x1b[31m%s\x1b[0m", "✗ | Download failed :(");
        console.error(err);
    }
}

function newCookie(headers) {
    let setCookie = headers.get("set-cookie");
    if (setCookie) {
        let cookieValStart = setCookie.indexOf("PHPSESSID=") + 10;
        let cookieValEnd = setCookie.indexOf(";", cookieValStart);
        if (cookieValEnd === -1 || cookieValStart === -1) return opts.headers.Cookie;
        return `PHPSESSID=${setCookie.substring(cookieValStart, cookieValEnd)}`;
    } else {
        return opts.headers.Cookie
    }
}

async function main() {
    for (let key in locations) {
        if (locations.hasOwnProperty(key)) await getUtil(locations[key], key);
    }
    console.log("\x1b[32m%s\x1b[0m", `\n✔ | All Done!\n✔ | You can find the downloaded files in ${path.join(__dirname, dirname)}`);
}

main()