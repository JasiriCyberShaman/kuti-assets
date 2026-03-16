"""
test_server.py
Project DDAimon - Local WebSocket Test Harness
* This script simulates the Python backend of Project DDAimon. It opens a local WebSocket 
server that your Cloudflare tunnel points to. When you press [ENTER], it reads a local 
audio file, encodes it, and pushes it through the tunnel to trigger Framer's AudioSync.
"""

import asyncio
import websockets
import json
import base64
import os

async def handler(websocket):
    """
    The main connection loop. This function is triggered every time a new client 
    (like your Framer frontend) connects to the WebSocket.
    """
    print(f"✅ [Server]: Neural Link Established via Cloudflare Tunnel!")
    
    try:
        # Keep the connection alive and wait for manual triggers
        while True:
            # --- NON-BLOCKING INPUT ---
            # Standard `input()` is synchronous and will freeze the entire async event loop, 
            # causing the WebSocket to time out and disconnect. 
            # `run_in_executor` offloads the waiting to a background thread.
            await asyncio.get_event_loop().run_in_executor(
                None, 
                input, 
                "👉 Press [ENTER] to fire test.wav..."
            )
            
            # --- AUDIO PROCESSING ---
            # Open the audio file in "rb" (read binary) mode
            with open("test.wav", "rb") as f:
                # Read the raw binary bytes and encode them into a Base64 string.
                # Base64 is required because we are sending this audio inside a JSON 
                # text payload, which cannot handle raw binary data.
                encoded = base64.b64encode(f.read()).decode('utf-8')
            
            # --- PAYLOAD CONSTRUCTION ---
            # This matches the API contract expected by SocketBridge.tsx and AudioSync.
            # "type" tells the bridge what to do, and "audioBase64" provides the data.
            payload = json.dumps({
                "type": "SPEECH_READY", 
                "audioBase64": encoded
            })
            
            # --- TRANSMISSION ---
            # Push the JSON string through the secure tunnel to the front-end
            await websocket.send(payload)
            print("🚀 [Server]: Payload delivered through the tunnel.")

    except Exception as e:
        # Catch disconnections (e.g., if you close the browser tab) or read errors
        print(f"⚠️ [Tunnel Error / Disconnect]: {e}")

async def main():
    """
    Bootstraps the WebSocket server on your local machine.
    """
    # Start the local listener.
    # The port here (8765) MUST match the port your Cloudflared tunnel is pointing to 
    # (e.g., `cloudflared tunnel --url http://localhost:8765`).
    # ping_timeout=None prevents the server from dropping the connection during long idle periods.
    async with websockets.serve(handler, "localhost", 8765, ping_timeout=None):
        print("🎧 [Server]: Local Port 8765 is now listening for the Tunnel.")
        
        # This keeps the main async function running indefinitely.
        # Without this, the script would start the server and immediately exit.
        await asyncio.Future()

if __name__ == "__main__":
    # Ignite the asyncio event loop
    asyncio.run(main())