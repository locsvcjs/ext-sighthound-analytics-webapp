import './App.css';
import "@fontsource/lexend"
import React from 'react';
import * as moment from "moment";

import ImageGrid from "./components/ImageGrid";
import Header from "./components/Header";
import { handleWebSocket } from "./websocketUtils";
import { Queue } from "./Queue";
import {
    getLSServerAddress,
    setLSServerAddress,
} from "./storageHandler";

let emptying = false; // flag indicating we're emptying the que, so don't re-enter que emptying fn
let stompClient = null;


function App() {
    const [selectedDetection, setSelectedDetection] = React.useState({});
    const [serverHostAddress, setServerHostAddress] = React.useState("");
    const [carDetections, setCarDetections] = React.useState([]);
    const [lpDetections, setLpDetections] = React.useState([]);
    const [connected, setConnected] = React.useState(false);
    const [que,] = React.useState(new Queue());


    // Trick to get state into the callback function 'dataIsArriving'.
    // Use for ex carStateRef.current when you want to read from 'carDetections'.
    const carStateRef = React.useRef();
    const lpStateRef = React.useRef();
    carStateRef.current = carDetections;
    lpStateRef.current = lpDetections;


    // Set up for data arriving.
    React.useEffect(() => {
        const serverAddr = getLSServerAddress();
        setServerHostAddress(serverAddr);
        initializeStomp(window.location.hostname);
        const handle = window.setInterval(() => { void checkQueue() }, 100); // check queue periodically
        return () => { window.clearInterval(handle); }                       // this runs on unmount and clears the timer
    }, []);

    React.useEffect(() => {
        if (carDetections.length === 1) {
            setSelectedDetection(carDetections[0]);
        }
    }, [false, carDetections, selectedDetection]);

    React.useEffect(() => {
    }, [carDetections]);


    async function initializeStomp(address) {
        stompClient = await handleWebSocket(dataIsArriving, address, stompClient, connectedStatus); // initialize websocket code
    }
    const connectedStatus = (status) => {
        setConnected(status);
    }
    const checkQueue = async () => {
        if (emptying) { return; }
        while (que && !que.isEmpty()) {
            emptying = true;
            const item = que.dequeue();
            await processItem(item);
        }
        if (que.isEmpty()) { emptying = false; }
    } 
    async function dataIsArriving(data) { // Callback. Websocket pushes metadata into a memory queue.
        if (que && data && data.body && typeof data.body == 'string') {
            console.log("  -- Got websocket data=", data.body);
            const rawData = JSON.parse(data.body);
            que.enqueue(rawData);
        }
    }


    /*
    Format of car and LP data we get:
    https://github.com/sighthoundinc/cloud-platform-schemas/blob/master/anypipe/examples/sighthoundAnalytics.json
    carId: string        // fill in when process links
    lpId: string
    carImageData: string // url of image data for a car
    lpImageData: string  // url of image data for a license plate
    bestTS: number       // in ms; will be bestTS of object found
    firstTS: number      // in ms; will be firstTS of object found
    boxCar: { height: number, width: number, x: number, y: number }
    boxLp: { height: number, width: number, x: number, y: number }
    carValue1: string    // make/model
    carValue2: string    // color
    lpValue1: string     // string
    lpValue2: string     // region
    type: string         // 'car' or 'lp' or 'person'
    links: array         // array of objects to correlate car <--> lp
    srcId: string        // id of the camera source
    frameId: string      // id of the frame; points to the image, used for persons
    lpValueConf: number  // confidence of the license plate string
    lpRegionConf: number // confidence of the license plate region
    mmConf: number       // confidence of the make/model values
    colorConf: number    // confidence of the car color
    */
    function handleCarObject(car, carId, localDetections, imageData, srcId, frameId, ts) {
        const lpId = findLink(car.links, "licensePlates");
        const entry = {
            type: "car",
            carId,
            lpId,
            carImageData: imageData,                     // jpg image
            lpImageData: imageData,                      // jpg image
            bestTS: car.bestDetectionTimestamp,          // in ms
            firstTS: car.firstFrameTimestamp,            // in ms
            boxCar: car.box,
            carValue1: car.attributes.vehicleType?.value,// for vehicles: type
            carValue2: car.attributes.color?.value,      // for vehicles: color
            lpValue1: "unknown",                         // for lps: string
            lpValue2: "unknown",                         // for lps: region
            links: car.links,
            srcId,
            frameId,
            ts,
            mmConf: car.attributes.vehicleType?.detectionScore,
            colorConf: car.attributes.color?.detectionScore,
        }
        // console.log("----- Got car, id=", carId, " mm=", car.attributes.vehicleType?.value);
        localDetections.push(entry);
    }
    function handleLpObject(lp, lpId, localDetections, imageData, srcId, frameId, ts) {
        const carId = findLink(lp.links, "vehicles");
        const entry = {
            type: "lp",
            carId,
            lpId,
            lpImageData: imageData,                 // jpg image
            carImageData: imageData,                // jpg image
            bestTS: lp.bestDetectionTimestamp,      // in ms
            firstTS: lp.firstFrameTimestamp,        // in ms
            boxLp: lp.box,
            lpValue1: lp.attributes.lpString?.value,// for lps: string
            lpValue2: lp.attributes.lpRegion?.value,// for lps: region
            links: lp.links,
            srcId,
            frameId,
            ts,
            lpValueConf: lp.attributes.lpString?.detectionScore,
            lpRegionConf: lp.attributes.lpRegion?.detectionScore,
        }
        // console.log("----- Got license plate, id=", lpId, " value=", lp.attributes.lpString?.value);
        localDetections.push(entry);
    }
    function findLink(linkArray, type) {
        for (const item of linkArray) {
            if (item.metaClass === type) {return item.id;}
        }
        return "";
    }



    const processItem = async (rawData) => {
        const frameId = rawData["frameId"] || "";
        const metaClasses = rawData["metaClasses"] || {};
        const srcId = rawData["sourceId"] || "";
        const ts = rawData["analyticsTimestamp"] || "";

        // First get the image.
        const filename = frameId + ".jpg";
        const imageData = await getImageFromNodeServer(filename);

        const cars = metaClasses.hasOwnProperty("vehicles") ? metaClasses.vehicles : [];
        const lps = metaClasses.hasOwnProperty("licensePlates") ? metaClasses.licensePlates : [];
        const carObjects = Object.entries(cars);
        const lpObjects = Object.entries(lps);

        const localDetections = [];
        const carDetections = [...carStateRef.current]; // get local copy of arrays
        const lpDetections = [...lpStateRef.current];

        // Process all incoming cars in the json data, add to localDetections array.
        for (const outerObj of carObjects) {
            const guid = outerObj[0];
            const obj = outerObj[1];
            handleCarObject(obj, guid, localDetections, imageData, srcId, frameId, ts);
        }
        // Process all incoming plates in the json data, add to localDetections array.
        for (const outerObj of lpObjects) {
            const guid = outerObj[0];
            const obj = outerObj[1];
            handleLpObject(obj, guid, localDetections, imageData, srcId, frameId, ts);
        }

        // If any incoming local entries exist in finalDetections,
        // then this entry will update the one in finalDetections,
        // else create new entry in finalDetections.
        const newItems = [];
        for (const oneDetection of localDetections) {
            // Find any 'car' detections that match this oneDetection.
            if (oneDetection.type === "car") {
                const results = carDetections.filter(det =>
                    det.carId === oneDetection.carId && oneDetection.srcId === det.srcId);
                if (results.length) { // found matching car
                    for (const det of results) {
                        det.bestTS = oneDetection.bestTS;
                        det.boxCar = oneDetection.boxCar;
                        det.carValue1 = oneDetection.carValue1;
                        det.carValue2 = oneDetection.carValue2;
                        det.carImageData = imageData;
                        det.mmConf = oneDetection.mmConf;
                        det.colorConf = oneDetection.colorConf;
                        det.lpId = findLink(oneDetection.links, "licensePlates");
                        // console.log("----- Updated car=", det.carId, " mm=", det.carValue1, " for LP=", det.lpId, " cbox=", det.boxCar);
                    }
                } else {
                    setCarDetections([oneDetection, ...carDetections]); // add this new car detection to array
                    newItems.push(oneDetection); // not found above, make new entry
                }
            } else if (oneDetection.type === "lp") {
                // Find any 'lp' detections that match this oneDetection.
                const results = lpDetections.filter(det =>
                    det.lpId === oneDetection.lpId && oneDetection.srcId === det.srcId);
                if (results.length) { // found matching lp
                    for (const det of results) {
                        det.bestTS = oneDetection.bestTS;
                        det.boxLp = oneDetection.boxLp;
                        det.lpValue1 = oneDetection.lpValue1;
                        det.lpValue2 = oneDetection.lpValue2;
                        det.lpImageData = imageData;
                        det.lpValueConf = oneDetection.lpValueConf;
                        det.lpRegionConf = oneDetection.lpRegionConf;
                        det.carId = findLink(oneDetection.links, "vehicles");
                        // console.log("----- Updated LP=", det.lpId, " value=", det.lpValue1, " for carId=", det.carId, " lpbox=", det.boxLp);
                    }
                } else {
                    setLpDetections([oneDetection, ...lpDetections]); // add this new lp detection to array
                    newItems.push(oneDetection); // not found above, make new entry
                }
            }
        }

        // Now correlate any cars to license plates using the "Links" array.
        const finalCarDetections = correlateCarsToPlates(carDetections, lpDetections, newItems);
        const uniqueCarDetections = collapseIdenticals(finalCarDetections);

        setSelectedDetection(uniqueCarDetections[0]);
        setCarDetections(uniqueCarDetections);
    }

    // Input: all detection objects.
    // Correlate one car to any license plate object. If found, take the
    // license plate data and put it into the final combined object.
    function correlateCarsToPlates(oldCarDets, oldLpDets, newItems) { // finalDets, localDets) {
        const outputArray = [];
        const newCars = newItems.filter(obj => obj.type === "car");
        const newLps = newItems.filter(obj => obj.type === "lp");
        const allCarItems = [...oldCarDets, ...newCars];
        const allLpItems = [...oldLpDets, ...newLps];

        for (const car of allCarItems) {
            for (const lp of allLpItems) {
                if (car.lpId === lp.lpId) {
                    car.lpValue1 = lp.lpValue1;
                    car.lpValue2 = lp.lpValue2;
                    car.boxLp = lp.boxLp;
                    car.lpValueConf = lp.lpValueConf;
                    car.lpRegionConf = lp.lpRegionConf;
                    car.lpImageData = lp.lpImageData;
                    break;
                }
            }
            outputArray.push(car);
        }
        return outputArray;
    }

    // Sometimes the detections give us 3 cars in a row that are the same car, but have
    // different ids. Once the license plate is resolved, we can then collapse these 3
    // cars into one with one license plate. "Unknown" license plates are not included.
    function collapseIdenticals(allDets) {
        const uniques = [];
        const setOfLps = new Set();

        // Loop through all detections, keeping unique license plate ids.
        for (const det of allDets) {
            let sizeOfSetBefore = setOfLps.size;
            setOfLps.add(det.lpId);
            if (setOfLps.size > sizeOfSetBefore) {
                uniques.push(det);
                // console.log(" +++ collapse - pushed unique plate=", det.lpValue1, " car=", det.carId);
            }
        }
        // Due to async processing, some items will appear out of order, plus we want the most recent
        // first. Reverse array, sort it. Sorts faster if array is almost in the right order to begin.
        uniques.reverse();
        uniques.sort(compareFn);
        return uniques;
    }
    // Compare timestamps; used by sort function.
    function compareFn(a, b) {
        return b.bestTS - a.bestTS;
    }



    const sd = selectedDetection; // for brevity below
    const canvasH = 275;

    return (
        <div>
            <Header
                setServerAddress={(evt) => handleNewServerAddress(evt.target.value)}
                serverAddress={serverHostAddress}
                connected={connected}
            />
            <hr/>
            <div>
                <div className="selectedContainer">
                    <div style={{
                        marginLeft: "auto",
                        marginRight: "auto",
                        maxHeight: { canvasH },
                    }}>
                        <div style={{
                            height: "100%",
                            flex: 1,
                            marginLeft: "auto",
                            marginRight: "auto",
                        }}>
                            {sd.type !== "lp" &&
                                <div style={{ maxHeight: canvasH }}>
                                    <img
                                        src={sd.carImageData}
                                        alt={sd.lpValue1}
                                        height={canvasH}
                                    />
                                </div>
                            }
                        </div>
                    </div>
                    {carDetections.length > 0 &&
                        <div style={{
                            width: 520,
                            marginLeft: "auto",
                            marginRight: "auto",
                            backgroundColor: "lightgray",
                            display: "flex",
                            flexDirection: "column",
                        }}>
                            <div className="selectedText">
                                <h2 style={{ textAlign: "center", marginTop: 2 }}>{sd.lpValue1} ({sd.lpValueConf})</h2>
                                <p style={{ marginBottom: 5, marginTop: -15 }}>{sd.lpValue2} ({sd.lpRegionConf})</p>
                                <p>{sd.carValue1} ({sd.mmConf})</p>
                                <p>{sd.carValue2} ({sd.colorConf})</p>
                                <p>{`Best TS: ${moment(sd.bestTS).format("YYYY-MM-DD HH:mm:ss.SSS")}`}</p>
                                {/*<p>{`First TS: ${moment(sd.firstTS).format("YYYY-MM-DD HH:mm:ss.SSS")}`}</p>*/}
                                {/*<p>{`First Frame: http://50.212.146.109:41034/frame/${sd.frameId}`} </p>*/}
                                <p style={{ fontSize: 11 }}>{sd.lpImageData} </p>
                            </div>
                        </div>
                    }
                </div>
                <ImageGrid detections={carDetections} />
            </div>
        </div>
    );

    const handleNewServerAddress = (address) => {
        setLSServerAddress(address);   // set new address into local storage
        setServerHostAddress(address); // set display of address in edit box
        initializeStomp(address);      // re-init websocket with new address
    }

    async function getImageFromNodeServer(filename) {
        try {
            let nodeDemoServerUrl = "http://localhost:4000";
            const serverAddress = getLSServerAddress();
            if (serverAddress) {
                nodeDemoServerUrl = "http://" + serverAddress + ":41034"; //4000
            }
            const rsp = await fetch(`${nodeDemoServerUrl}/image/${filename}`);
            if (rsp.status === 200) {
                const buffData = await rsp.blob();
                const buffUrl = URL.createObjectURL(buffData);
                return buffUrl;
            }
            console.log("ns - ERROR getting image data! rsp.status=", rsp.status);
        } catch (err) {
            console.log("getImageFromNodeServer - EXCEPTION - err=", err);
        }
        return null;
    }
}
export default App;