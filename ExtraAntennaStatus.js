// ==UserScript==
// @name         Huawei Extra Antenna Status dashboard
// @namespace    http://github.com/Postrediori/HuaweiMobileDashboard
// @version      0.5.1
// @description  Additional dashboard with antenna signal data
// @author       Postrediori
// @match        http://192.168.8.1/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function() {

'use strict';

/**
 * Constants
 */
const UPDATE_MS = 2000;

let boxcar = 80, gt = 3, gw = boxcar*(gt+1), gh = 30, ghd = gh * 1.75;

const SIZE_KB = 1024;
const SIZE_MB = 1024 * 1024;
const SIZE_GB = 1024 * 1024 * 1024;

/**
 * Global variables
 */
let mode = "", btstatus;
let history = {sinr: [], rsrp: [], rsrq: [], rscp: [], ecio: [], dlul:[]};
let timerInterval;

function getDocument(data, type) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, type);
        const errorNode = doc.querySelector("parsererror");

        if (errorNode) {
            console.log("DOM Error: Error while parsing");
            return null;
        }

        return doc;
    }
    catch (err) {
        console.log("DOM Error:", err.message);
    }
    return null;
}

/**
 * Convert string with XML into Document object
 * @param {String} data String with XML data
 * @returns Document object or null
 */
function getXMLDocument(data) {
    return getDocument(data, "application/xml");
}

/**
 * Extract tag from XML
 * @param {String} tagName Name of the tag
 * @param {String} doc Document object with XML data
 * @returns Contents of the tag or null
 */
function extractXML(tagName, doc) {
    try {
        const tags = doc.querySelector(tagName);
        if (tags) {
            return tags.innerHTML;
        }
    }
    catch (err) {
        console.log("XML Error:", err.message);
    }
    return null;
}

/**
 * Get csrf_token of the session from meta tags
 * @param {String} String with HTML data
 * @returns String with csrf_token or null
 */
function getDocumentCsrfToken(data) {
    let doc = getXMLDocument(data);
    if (!doc) {
        console.log("Error:Cannot get Web UI page");
        return null;
    }

    const tag = doc.querySelector("TokInfo");
    if (!tag) return null;

    return tag.innerHTML;
}

/**
 * Get error code from response data
 * @param {String} data XMLDocument with XML response
 * @returns Error code or zero in case operation was successfull
 */
function getResponseStatus(doc) {
    const tag = doc.querySelector("response");
    if (tag && tag.innerHTML === "OK") {
        return 0;
    }
    else {
        const errtag = doc.querySelector("error");
        if (errtag) {
            let report = "Received response"
            for (const t of errtag.children) {
                if (t.innerHTML!=="") {
                    report += ` ${t.nodeName}:${t.innerHTML}`;
                }
            }
            console.log("Error:", report);
        }
        else {
            console.log("Error: Received response with unknown status");
        }
        return 1;
    }
}

/**
 * Format download/upload value
 * @param {Number} bytesPerSec Number of bytes per second
 * @returns Formatted string with proper units (kbps, mpbs, etc)
 */
function formatBandwidth(bytesPerSec) {
    const RATE_BPS = "bit/s";
    const RATE_KBPS = "KBit/s";
    const RATE_MBPS = "MBit/s";

    let bitsPerSec = bytesPerSec * 8;

    if (bitsPerSec<SIZE_KB) {
        return `${bitsPerSec}${RATE_BPS}`;
    }
    else if (bitsPerSec<SIZE_MB) {
        return `${(bitsPerSec / SIZE_KB).toFixed(2)}${RATE_KBPS}`;
    }
    else {
        return `${(bitsPerSec / SIZE_MB).toFixed(2)}${RATE_MBPS}`;
    }
}

/**
 * Remove trailing unit of the value
 * @param {String} s Signal value with unit
 * @returns Value without unit
 */
function clearUnit(s) {
    return s.replace(/dB(m)?$/,"");
}

/**
 * Convert Huawei's internal network mode ID to human format
 * @param {String} mode Network mode ID
 * @returns Human readable networking mode (GSM, WCDMA, LTE)
 */
function getModeDescription(mode) {
    const NETWORK_MODE_2G = "0";
    const NETWORK_MODE_3G = "2";
    const NETWORK_MODE_4G = "7";

    switch(mode) {
    case NETWORK_MODE_2G: return "GSM";
    case NETWORK_MODE_3G: return "WCDMA";
    case NETWORK_MODE_4G: return "LTE";
    }
    return "Unknown mode";
}

/**
 * Set output label of the parameter in the UI
 * @param {String} param ID f the control in the UI
 * @param {String} val Value of the parameter
 */
function setParam(param, val) {
    try {
        document.getElementById(param).innerHTML = val;
    } catch (param) {};
}

/**
 * Set visibility of a block specifiedby id
 * @param {String} id Id of a block
 * @param {Boolean} visible Flag of visibility
 */
function setVisible(id, visible) {
    document.getElementById(id).style.display = visible ? "block" : "none";
}

/**
 * Set background color of a control
 * @param {String} id Id of a block
 * @param {String} c Color
 */
function setColor(id,c) {
    document.getElementById(id).style.backgroundColor = c;
}

/**
 * Switch networking mode. Update visibility of UI controls.
 * Does nothing if mode didn't change.
 * @param {String} newMode New networking mode (WCDMA, LTE)
 */
function setMode(newMode) {
    if (mode !== newMode) {
        mode = newMode;
        console.log("Network mode set to", mode);

        setVisible("status_3g", false);
        setVisible("status_lte", false);

        setVisible("ucellid", false);
        setVisible("u3g", false);
        setVisible("ulte", false);

        for (let k in history) history[k] = [];

        if (mode === "WCDMA") {
            setVisible("status_3g", true);
            setVisible("ucellid", true);
            setVisible("u3g", true);
        }
        else if (mode === "LTE") {
            setVisible("status_lte", true);
            setVisible("ucellid", true);
            setVisible("ulte", true);
        }
    }
}

function barGraph(p, val, min, max) {
    if(val > max){val = max;}
    if(val < min){val = min;}
    history[p].unshift(val);
    if(history[p].length > boxcar){history[p].pop();}
    let html = `<svg version="1.1" viewBox="0 0 ${gw} ${gh}" width="${gw}" height="${gh}" preserveAspectRatio="xMaxYMax slice" style="border:1px solid #ccc;padding:1px;margin-top:-6px;width:${gw}px;">`;

    for (let x = 0; x < history[p].length; x++) {
        let pax = (gt + 1) * (x + 1);
        let pay = gh - 1;
        let pby = gh - (history[p][x] - min) / (max - min) * gh;
        if (isNaN(pby)){pby = pay;}
        let pc = (history[p][x] - min) / (max - min) * 100;
        let color = pc < 50 ? "red" : (pc < 85 ? "orange" : "green");
        html += `<line x1="${pax}" y1="${pay}" x2="${pax}" y2="${pby}" stroke="${color}" stroke-width="${gt}"></line>`;
    }
    html += "</svg>";
    document.getElementById("b" + p).innerHTML = html;
}

function nearestFib(x) {
    let f1=0, f2=1, fn = 0;

    for (let n=1; n<20; n++) {
        fn = f1 + f2;
        if (x<fn) {
            break;
        }
        f2 = f1;
        f1 = fn;
    }
    return fn;
}

function barGraphDlUl(p, valDl, valUl) {
    history[p].unshift([valDl*8, valUl*8]);
    if(history[p].length > boxcar){history[p].pop();}

    let maxDlUl = history[p].reduce( (accum,current) => [Math.max(accum[0],current[0]),Math.max(accum[1],current[1])] );
    maxDlUl = Math.max(maxDlUl[0], maxDlUl[1]);
    const maxMb = nearestFib(maxDlUl / SIZE_MB);

    const maxPlot = maxMb * SIZE_MB;

    let html = `<svg version="1.1" viewBox="0 0 ${gw} ${ghd}" width="${gw}" height="${ghd}" preserveAspectRatio="xMaxYMax slice" style="border:1px solid #ccc;padding:1px;margin-top:-6px;width:${gw}px;">`;

    for (let x = 0; x < history[p].length; x++) {
        let dl = history[p][x][0], ul = history[p][x][1];

        let pax = (gt + 1) * (x + 1);
        let pay = ghd - 1;

        let pbyDl = ghd * (1 - dl / maxPlot);
        let pbyUl = ghd * (1 - ul / maxPlot);

        let pby1 = pay, pby2 = pay;
        let color1 = "#DDCC77", color2 = "grey";
        if (ul < dl) {
            pby1 = pbyUl;
            pby2 = pbyDl;
            color2 = "#332288";
        }
        else {
            pby1 = pbyDl;
            pby2 = pbyUl;
            color2 = "#88CCEE";
        }

        html += `<line x1="${pax}" y1="${pay}" x2="${pax}" y2="${pby1}" stroke="${color1}" stroke-width="${gt}"></line>`;
        html += `<line x1="${pax}" y1="${pby1}" x2="${pax}" y2="${pby2}" stroke="${color2}" stroke-width="${gt}"></line>`;
    }
    html += `<text x="${gw}" y="0" dominant-baseline="hanging" text-anchor="end" style="fill:gray;">${maxMb.toFixed(0)}MBit/s</text>`;
    html += "</svg>";
    document.getElementById("b" + p).innerHTML = html;
}

/**
 * Update UI dashboard with current status of the modem
 */
function currentBand() {
    $.ajax({
        type: "GET",
        async: true,
        url: '/api/device/signal',
        error: function(request,status,error) {
            console.log("Error: Cannot get Signal data:", request.status, "\nmessage:", request.responseText, "\nerror:", error);
        },
        success: function(data) {
            const doc = getXMLDocument(data);
            if (doc) {
                const currentMode = getModeDescription(extractXML("mode", doc));

                let report = `Network mode : ${currentMode}`;
                setParam("mode", currentMode);
                setMode(currentMode);

                const rssi = extractXML("rssi", doc);
                setParam("rssi", rssi);
                report += `\nRSSI : ${rssi}`;

                const cellid = Number(extractXML("cell_id", doc));
                const cellidhex = cellid.toString(16).toUpperCase();

                setParam("cellidhex", cellidhex);
                setParam("cellid", cellid);
                report += `\nCell ID : ${cellidhex} / ${cellid}`;

                if (mode === "WCDMA") {
                    const rscp = extractXML("rscp",doc);
                    const ecio = extractXML("ecio",doc);
                    report += `\nRSCP : ${rscp} EC/IO : ${ecio}`;

                    setParam("rscp", rscp); barGraph("rscp", clearUnit(rscp), -100, -70);
                    setParam("ecio", ecio); barGraph("ecio", clearUnit(ecio), -10, -2);

                    const psc = extractXML("sc",doc);
                    setParam("psc", psc);

                    const rnc = cellid >> 16;
                    const id = cellid & 0xffff;
                    setParam("rnc", rnc);
                    report += `\nRNC-ID : ${rnc}`;

                    const nb = Math.floor(id / 10);
                    const cc = id - nb * 10;
                    setParam("nb", nb);
                    setParam("cc", cc);
                    report += `\NB ID / Cell : ${nb} / ${cc}`;
                }
                else if (mode === "LTE") {
                    const rsrq = extractXML("rsrq",doc);
                    const rsrp = extractXML("rsrp",doc);
                    const sinr = extractXML("sinr",doc);
                    report += `\nRSRQ/RSRP/SINR : ${rsrq}/${rsrp}/${sinr}`;

                    setParam("rsrp", rsrp); barGraph("rsrp", clearUnit(rsrp), -130, -60);
                    setParam("rsrq", rsrq); barGraph("rsrq", clearUnit(rsrq), -16, -3);
                    setParam("sinr", sinr); barGraph("sinr", clearUnit(sinr), 0, 24);

                    const pci = extractXML("pci",doc);
                    setParam("pci", pci);

                    const enb = cellid >> 8;
                    const id = cellid & 0xff;
                    setParam("enb", enb);
                    setParam("cell", id);
                    report += `\neNB / Cell : ${enb} / ${id}`;
                }

                console.log(report);
            }
        }
    });

    $.ajax({
        type: "GET",
        async: true,
        url: '/api/monitoring/traffic-statistics',
        error: function(request,status,error) {
            console.log("Error: Traffic statistics response fail:", request.status, "\nmessage:", request.responseText, "\nerror:", error);
        },
        success: function(data) {
            const doc = getXMLDocument(data);
            if (doc) {
                const dl = extractXML("CurrentDownloadRate", doc);
                const ul = extractXML("CurrentUploadRate", doc);
                const dlStr = formatBandwidth(dl);
                const ulStr = formatBandwidth(ul);

                setParam("dl", dlStr);
                setParam("ul", ulStr);
                barGraphDlUl("dlul", dl, ul);

                console.log(`Download : ${dlStr} Upload : ${ulStr}`);
            }
        }
    });

    $.ajax({
        type: "GET",
        async: true,
        url: '/api/net/current-plmn',
        error: function(request,status,error) {
            console.log("Error: PLMN status response fail:", request.status, "\nmessage:", request.responseText, "\nerror:", error);
        },
        success: function(data) {
            const doc = getXMLDocument(data);
            if (doc) {
                const plmn = extractXML("Numeric", doc);

                setParam("plmn", plmn);

                console.log(`PLMN : ${plmn}`);
            }
        }
    });

    $.ajax({
        type: "GET",
        async: true,
        url: '/api/monitoring/status',
        error: function(request,status,error) {
            console.log("Error: PLMN status response fail:", request.status, "\nmessage:", request.responseText, "\nerror:", error);
        },
        success: function(data) {
            const doc = getXMLDocument(data);
            if (doc) {
                const newstatus = extractXML("BatteryStatus", doc);
                if (btstatus!==newstatus) {
                    btstatus = newstatus;

                    setVisible("battery", btstatus!=="");
                }

                if (btstatus!=="") {
                    const btlevel = extractXML("BatteryPercent", doc);

                    setParam("btlevel", `${btlevel}%`);

                    const BATTERY_SOURCE = {
                        "0" : "No Charge",
                        "1" : "Charging",
                        "-1" : "Low",
                        "2" : "No Battery",
                    };

                    setParam("btsource", BATTERY_SOURCE[btstatus.toString()]);
                }
            }
        }
    });
}

function setBandWait() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval=null; }
    setVisible("t", true);
    setParam("t",   "PLEASE WAIT");
    setColor("t", "orange");
}

function setBandSuccess() {
    setParam("t", "SUCCESS");
    setColor("t", "green");
    timerInterval=setInterval(function(){setVisible("t",false);},5000);
}

function setBandError() {
    setParam("t", "ERROR");
    setColor("t", "red");
    timerInterval=setInterval(function(){setVisible("t",false);},5000);
}

function ltebandselection(e) {
    let band = prompt("Please input desirable LTE band number. " +
        "If you want to use multiple LTE bands, write down multiple band number joined with '+'. " +
        "If you want to use every supported bands, write down 'ALL'. (e.g. 3+7 / 1+3 / 1+3+8). " +
        "Leave this empty to leave as is.", "ALL");
    if (band===null || band==="") {
        console.log("No band selected");
        return;
    }

    let lteFlags;
    if(band.toUpperCase()==="ALL") {
        lteFlags = "7FFFFFFFFFFFFFFF";
    }
    else {
        let bandList = band.split('+');
        let flags = 0;
        for (const bandId of bandList) {
            flags = flags + Math.pow(2, parseInt(bandId)-1);
        }
        lteFlags = flags.toString(16);
    }
    console.log("LTE Band Flags:", lteFlags);

    setBandWait();

    $.ajax({
        type:"GET",
        async: true,
        url: '/api/webserver/SesTokInfo',
        error: function(request,status,error){
            console.log("Token Error:", request.status, "\nmessage:", request.responseText, "\nerror:", error);
        },
        success: function(data){
            let token = getDocumentCsrfToken(data);
            if (!token) {
                console.log("Error: Web UI page is not logged in");
                return;
            }

            let nw = function(mode) {
                switch(mode) {
                case "0": return "00"; /* LTE > WCDMA > GSM */
                case "1": return "0103"; /* LTE > GSM */
                case "2": return "0203"; /* LTE > WCDMA */
                case "3": return "03"; /* LTE Only */
                }
                return "00";
            }(document.getElementById("mode_lte").value);

            setTimeout(function() {
                $.ajax({
                    type: "POST",
                    async: true,
                    url: '/api/net/net-mode',
                    headers: {'__RequestVerificationToken':token},
                    contentType: 'application/xml',
                    data: `<request><NetworkMode>${nw}</NetworkMode><NetworkBand>3FFFFFFF</NetworkBand><LTEBand>${lteFlags}</LTEBand></request>`,
                    success: function(nd){
                        /* It may be either string or XMLDocument here */
                        let doc;
                        if (typeof(nd)==="string" || nd instanceof String) {
                            doc = getXMLDocument(nd);
                        }
                        else {
                            doc = nd;
                        }

                        let status = getResponseStatus(doc);
                        if (status === 0) {
                            console.log("Network mode set successfully");
                            setBandSuccess();
                        }
                        else {
                            console.log("Error while setting band list");
                            setBandError();
                        }
                        supportedBands();
                    },
                    error: function(request,status,error){
                        console.log("Net Mode Error:", request.status, "\nmessage:", request.responseText, "\nerror:", error);
                        setBandError();
                        supportedBands();
                    }
                });
            }, UPDATE_MS);
        }
    });
}

/**
 * Get a list of supported bands using tag items
 * @param {Document} doc XML Document with list of supported bands
 * @param {String} tag Name of the tag with bands
 * @returns BigInt with bands mask
 */
function getBandFlags(doc, tag) {
    let flags = 0n;

    for (const lt of doc.querySelectorAll(tag)) {
        for (const t of lt.childNodes) {
            /* Skip 'All bands' element as it contains just FFFFs */
            if (t.nodeName==="Name" && t.innerHTML.toLowerCase()==="all bands") break;

            if (t.nodeName==="Value") {
                try {
                    let f=BigInt(`0x${t.innerHTML}`);
                    flags|=f;
                } catch(err){console.log("Error: Cannot parse band mask:",err.message);}
            }
        }
    }

    return flags;
}

function supportedBands() {
    $.ajax({
        type: "GET",
        async: true,
        url: '/api/net/net-mode',
        error: function(request,status,error) {
            console.log("Error: Active networks response fail:", request.status, "\nmessage:", request.responseText, "\nerror:", error);
        },
        success: function(data) {
            const doc = getXMLDocument(data);
            if (!doc) { return; }

            let flagsActive = 0n;
            try {
                do {
                    const m=doc.querySelector("NetworkMode");
                    if (!m) break;
                    const mode = m.innerHTML;

                    /* Check if 'All' (00) or 'LTE Only' is enabled */
                    if (mode.indexOf("00")===-1 && mode.indexOf("03")===-1) break;

                    const t=doc.querySelector("LTEBand");
                    if (t) {
                        flagsActive=BigInt(`0x${t.innerHTML}`);
                    }
                } while(0);
            }
            catch(err) {
                console.log("Error: cannot parse band flags:",err.message);
            }
            console.log(`Active LTE flags: 0x${flagsActive.toString(16)}`);

            $.ajax({
                type: "GET",
                async: true,
                url: '/api/net/net-mode-list',
                error: function(request,status,error) {
                    console.log("Error: Supported networks response fail:", request.status, "\nmessage:", request.responseText, "\nerror:", error);
                },
                success: function(data) {
                    const doc = getXMLDocument(data);
                    if (!doc) {
                        return;
                    }

                    /* LTE Bands */
                    let flagsLte = getBandFlags(doc, "LTEBand");

                    let supportedLte = [];

                    let x=1;
                    while (flagsLte!=0n) {
                        if ((flagsLte & 1n) !== 0n) {
                            supportedLte.push(x);
                        }
                        x++;
                        flagsLte = flagsLte >> 1n;
                    }

                    setParam('support_lte', supportedLte.map(function(k){
                        return `<span class="${ (flagsActive & (1n << BigInt(k-1))) !== 0n ? "band_on" : "band_off" }">B${k}</span>`;
                    }).join('+'));

                    let report = `Supported LTE: ${supportedLte.map(function(k){return `B${k}`}).join('+')}`;
                    console.log(report);
                }
            });
        }
    });
}

function statusHeader() {
const header = `<style>
    #mode,
    #rssi,
    #plmn,
    #cellidhex,#cellid,
    #nb,#cc,#rnc,#psc,
    #enb,#cell,#pci,
    #rscp,
    #ecio,
    #rsrq,
    #rsrp,
    #sinr,
    #ul,
    #dl,
    #support_lte,
    #btlevel, #btsource {
        color: #b00;
        font-weight: strong;
    }

    .band_on { color: blue; }
    .band_off { color: grey; }

    #setband {
        font-weight:bolder;
        background-color: #448;
        color:white;
        padding: 10px;
        border-radius:10px;
    }

    .f {
        float: left;
        border: 1px solid #bbb;
        border-radius: 5px;
        padding: 10px;
        line-height: 2em;
        margin: 5px;
    }

    .f ul {
        margin: 0;
        padding: 0;
    }

    .f ul li {
        display: inline;
        margin-right: 10px;
    }

    #t {
        float: left;
        color: white;
        margin: 10px;
        padding: 10px;
        border-radius: 10px;
        display: none;
        text-align: center;
        font-weight: bolder;
    }
</style>
<div style="display:block;overflow:auto;">
    <div class="f" id="status_general">
        <ul>
            <li>Network mode:<span id="mode">#</span></li>
            <li>RSSI:<span id="rssi">#</span></li>
        </ul>
        <ul>
            <li>PLMN:<span id="plmn">#</span></li>
        </ul>
        <ul id="ucellid">
            <li>Cell ID:<span id="cellidhex">#</span>/<span id="cellid">#</span></li>
        </ul>
        <ul id="u3g">
            <li>NB ID / Cell:<span id="nb">#</span>/<span id="cc">#</span></li>
            <li>RNC-ID:<span id="rnc">#</span></li>
            <li>SC:<span id="psc">#</span></li>
        </ul>
        <ul id="ulte">
            <li>eNB / Cell:<span id="enb">#</span>/<span id="cell">#</span></li>
            <li>PCI:<span id="pci">#</span></li>
        </ul>
    </div>
    <div class="f" id="status_3g">
        RSCP:<span id="rscp">#</span><div id="brscp"></div>
        EC/IO:<span id="ecio">#</span><div id="becio"></div>
    </div>
    <div class="f" id="status_lte">
        RSRQ:<span id="rsrq">#</span><div id="brsrq"></div>
        RSRP:<span id="rsrp">#</span><div id="brsrp"></div>
        SINR:<span id="sinr">#</span><div id="bsinr"></div>
    </div>
    <div class="f" id="bandwidth">
        <ul>
            <li>Download:<span id="dl">#</span></li>
            <li>Upload:<span id="ul">#</span></li>
        </ul><div id="bdlul"></div>
    </div>
    <div class="f" id="battery">
        <ul>
            <li>Battery:<span id="btlevel">#</span></li>
            <li>Charge:<span id="btsource">#</span></li>
        </ul>
    </div>
</div>
<div style="display:block;overflow:auto;">
    <div class="f">
        <ul>
            <li><a id="setband" href="#">Set LTE Bands</a></li>
            <li><label>Mode</label>&nbsp;<select id="mode_lte">
                <option value="0">Auto</option>
                <option value="1">LTE > GSM</option>
                <option value="2">LTE > WCDMA</option>
                <option value="3" selected="on">LTE Only</option>
            </select></li>
        </ul>
    </div>
    <div id="t"></div>
    <div class="f">
        <ul>
            <li>SUPPORTED LTE:<span id="support_lte"></span></li>
        </ul>
    </div>
</div>`;
    document.body.insertAdjacentHTML("afterbegin", header);
    document.getElementById("setband").addEventListener (
        "click", ltebandselection, false
    );
    supportedBands();
    setInterval(currentBand, UPDATE_MS);
}

statusHeader();

})();
