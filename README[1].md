# Battle King Hazen — Online Server

This project adds actual shared rooms for PvP and Phố Hazen using Node.js + Socket.IO. It is not online until this project is deployed to a public Node.js host. Do not open `public/index.html` directly with `file://`; open the URL provided by the deployed server.

## Run locally
1. Install Node.js 20 or newer.
2. In this folder run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000`.
5. For a second test player, open the same URL in another browser or device on the same network (for LAN, use the host computer's local IP and allow port 3000 through firewall).

## Deploy for friends over the internet
Deploy this folder as a Node.js web service on a host that supports WebSockets (for example Render or Railway). Build command: `npm install`. Start command: `npm start`. Open the HTTPS URL the host gives you. Both you and friends must use the exact same deployed URL.

## Rooms
- PvP: main menu → PvP PHÒNG → create room. Share the six-digit code. A friend chooses PvP PHÒNG and enters it. Basic close-range attacks reduce the opponent's HP; a defeated player respawns.
- Phố Hazen: main menu → MAP → PHỐ HAZEN ONLINE. Create a room and share its code. Players can move together and chat; skills are for testing and do not have cooldown in this mode.

## Important limitations
This is a starter multiplayer server, not a hardened production service. Room codes are temporary and disappear when the server restarts or everyone leaves. Player names are anonymous IDs. Do not treat the client-side ADMIN mode as secure; anyone can modify local HTML. Before a public release, add accounts, server-side authority for all skill damage, abuse protection/rate limits, and moderation tools.
