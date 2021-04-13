'use strict'

const fs = require('fs');
const path = require('path');
const util = require('util');
const ProgressBar = require('progress');
const fetch = require('node-fetch');
const stream = require('stream');
const DOMParser = require('jsdom');
const FormData = require('form-data');

//TODO: Complete JSON file
//TODO: Comment code
//TODO: Wrap in .command and .bat file
//TODO: Use 10GBit servers
//TODO: Move to TypeScript
//TODO: Print total runtime at the end
//TODO: Extract zip

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

let g3dOpts = {
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

    let file, response, body, headers, knownLength = true;

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

    headers = response.headers;

    let headerFilename = getFilenameFromHeaders(headers);
    filename = (headerFilename === undefined) ? filename : headerFilename;
    file = fs.createWriteStream(path.join(dirname, filename));

    let contentLength = headers.get('content-length');
    knownLength = !!contentLength;
    if (!knownLength) console.log("\x1b[33m%s\x1b[0m", "⚠ | Will download without progress bar. Tell the server owner to include a content-length header!");
    let totalSize = (knownLength) ? parseInt(headers.get('content-length'), 10) : 1;
    let downloaded = 0;

    let pb = new ProgressBar(`* | ${filename}\t :percent [:bar] :rate b/s ETA :etas`, {
        complete: '=',
        head: '>',
        incomplete: ' ',
        width: 30,
        total: totalSize
    });

    response.body.on('data', (chunk) => {
        downloaded += chunk.length; // not in use at the moment
        if (knownLength) {
            pb.tick(chunk.length);
        }
    });

    try {
        await pipeline(body, file);
    } catch (err) {
        file.close();
        fs.unlinkSync(filename); // delete file in case of failure
        throw err;
    }

    if (!knownLength) pb.tick(1);
    file.close();

    return {filename: filename, size: downloaded};
}

async function get(url, name) {
    if (!name) name = url;

    // console sugar
    console.log(`* | Now downloading ${name}...`);

    let address;
    let host = (new URL(url)).hostname.toString();
    // choose url extraction algorithm  or default to simple download
    if (host.includes("guru3d")) {
        address = await getGuru3DURL(url);
    } else if (host.includes("techpowerup")) {
        address = await getTechPowerUpURL(url);
    } else {
        address = url;
    }

    // download and print console sugar
    try {
        if (!address) throw new Error("Download function was going to receive bad input.");
        let {filename, size} = await download(address);
        console.log("\x1b[32m%s\x1b[0m", `✔ | Downloaded ${filename}! (${(size/1000000).toFixed(2)} MB)`);
    } catch (err) {
        console.log("\x1b[31m%s\x1b[0m", "✗ | Download failed :(");
        console.error(err);
    }
}

async function getGuru3DURL(url) {
    // find div containing links
    let page = await fetch(url, g3dOpts);
    g3dOpts.headers.Cookie = newCookie(page.headers);  // set PHPSESSID if a new one was sent
    page = await page.text();
    let downloadPage = new DOMParser.JSDOM(page).window.document.body.getElementsByClassName("lower-greek")[0].children[0].href;

    // go to download page
    await fetch(downloadPage, g3dOpts)

    // go to common download endpoint and intercept 302 location
    let address, response;
    try {
        response = await fetch(`https://www.guru3d.com/index.php?ct=files&action=download&`, g3dOpts);
        address = getLocationFromHeaders(response.headers);
    } catch (err) {
        console.error(err);
        return address;
    }

    return address;

}

async function getTechPowerUpURL(url) {
    let formData = new FormData();
    let tpuOpts = {
        method: "GET",
        redirect: "manual"
    }

    let response, page, address;
    // get download page
    response = await fetch(url, tpuOpts);
    page = await response.text();
    // get id
    let id = new DOMParser.JSDOM(page).window.document.body.querySelector("div.versions form input").value;
    // get first server id
    tpuOpts.method = "POST";
    tpuOpts.body = formData;
    formData.append("id", id);

    response = await fetch(url, tpuOpts);
    page = await response.text();
    let serverId = new DOMParser.JSDOM(page).window.document.body.querySelector("div.mirrorlist > button").value;
    // send post req, intercept location header
    formData = new FormData();  // FormData object freezes requests when sent twice, so we re-generate it
    tpuOpts.body = formData;
    formData.append("id", id);
    formData.append("server_id", serverId);

    response = await fetch(url, tpuOpts);
    address = getLocationFromHeaders(response.headers);

    return address;
}

function newCookie(headers) {
    let setCookie = headers.get("set-cookie");
    if (setCookie) {
        let cookieValStart = setCookie.indexOf("PHPSESSID=") + 10;
        let cookieValEnd = setCookie.indexOf(";", cookieValStart);
        if (cookieValEnd === -1 || cookieValStart === 9) return g3dOpts.headers.Cookie;
        return `PHPSESSID=${setCookie.substring(cookieValStart, cookieValEnd)}`;
    } else {
        return g3dOpts.headers.Cookie
    }
}

function getFilenameFromHeaders(headers) {
    let filename = undefined;
    try {
        let matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(headers.get("content-disposition"));
        if (matches != null && matches[1]) {
            filename = matches[1].replace(/['"]/g, '');
        }
        return filename;
    } catch (err) {
        return filename;
    }
}

function getLocationFromHeaders(headers) {
    let loc;

    try {
        loc = headers.get("location");
    } catch (err) {
        throw new Error("Location header not found, returning undefined");
    }

    if (!loc) {
        throw new Error("Location header not found, returning undefined");
    }

    return loc;
}

async function main() {
    for (let key in locations) {
        if (locations.hasOwnProperty(key)) await get(locations[key], key);
    }

    console.log("\x1b[32m%s\x1b[0m", `\n✔ | All Done!\n✔ | You can find the downloaded files in ${path.join(__dirname, dirname)}`);
}

main()