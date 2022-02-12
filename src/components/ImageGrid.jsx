import React from 'react';

function ImageGrid({ detections }) {
    return (
        <div className="imageGrid">
            {detections.map((detection, index) => {
                return (
                    <div key={`DETECTION_${index}`}>
                        <p key={`PLATE_${index}`} style={{ marginTop: 0 }}>
                            {detection.lpValue1}({detection.lpValueConf})<br />
                            {detection.lpValue2}({detection.lpRegionConf})<br />
                            {detection.carValue1} ({detection.mmConf})<br />
                            {detection.carValue2} ({detection.colorConf})<br />
                        </p>
                        <img
                            className={"gridImage"}
                            src={detection.carImageData}
                            alt={detection.lpValue1}
                            key={`IMG_${index}`}
                        />
                    </div>
                )
            })}
        </div>
    )
}
export default ImageGrid;