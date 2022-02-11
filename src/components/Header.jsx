import '../App.css';
import React from 'react';

function Header({
    setServerAddress,
    serverAddress,
    connected,
}) {
    return (
        <div>
            <nav>
                <img src="/Sighthound_Logo_Horizontal_Dark.png" alt="Sighthound Logo" />
                <div style={{ width: 200 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "left" }}>
                        <div>
                            <div>
                                <input
                                    placeholder="Server Address"
                                    id="server"
                                    type="text"
                                    value={serverAddress}
                                    onChange={(val) => setServerAddress(val)} />
                            </div>
                        </div>
                        <div>
                            <p style={{ margin: "5px 0 0 0", fontSize: "0.8rem" }}>
                                Connected:
                                {connected ?
                                    <span className="greenDot"></span>
                                    :
                                    <span className="redDot"></span>
                                }
                            </p>
                        </div>
                    </div>
                </div>
            </nav>
        </div>
    )
}
export default Header;