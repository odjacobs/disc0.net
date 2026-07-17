---
title: "Introducing Sampo: Cloud DNC for the Shop Floor"
description: "Sampo is cloud DNC software from Sampo Labs: upload a CNC program in the browser, send it to any machine over the RS232 port it already has."
---

There's a fact about manufacturing that surprises people who've never set foot in a machine shop: the half-million-dollar CNC machine on the floor probably receives its programs over RS232. Same protocol as a dial-up modem. A lot of controls running today were built before Ethernet was cheap, and nobody scraps a machine that still holds tolerance just because its only way in is a serial port.

So programs get moved the way they've been moved for thirty years. A USB stick, if you're lucky and the control is new enough. More often it's some ancient laptop missing a few keys with a serial cable and a DNC utility made by some retired guy in Florida, or a shared folder with a file named "```O0225 (2)```". When a part comes back wrong, or just straight up scrapped, the first question is always the same: where is my program?

That question is why I'm building [Sampo](https://sampolabs.net/sampo/).

The short version: you upload a program once in a browser portal and send it to any machine in the shop from there. A small agent runs on a mini-PC next to each control, keeps an outbound connection to the cloud, and pushes the file down the machine's serial cable. The machine needs no network card and no control upgrade. The RS232 port it already has is the whole interface. (There's an FTP mode too, for controls that would rather pull files than be pushed.)

The part I care about most is boring on purpose: every upload is a new immutable revision, and nothing is ever overwritten. Rolling back to an old revision doesn't rewind history either. Sampo appends a new revision with the old content, so the chain always shows what actually happened. You can diff any two revisions line by line in the portal. When someone asks what changed between the part running fine on Tuesday and the one scrapping parts on Thursday, the answer is a click instead of an archaeology project.

It works in the other direction too. Machinists tweak programs at the control, offsets and feeds and the little edits that never make it back to the office, and Sampo can receive a program off the machine and save it as a new revision of the same part. There's also a fullscreen terminal UI for the machinist: their machine's programs, a big ```SEND``` button, and work instructions. Instructions can be uploaded as PDFs or Office docs, or written in the portal's built-in editor, and the terminal caches whatever it has shown so a cloud hiccup doesn't take the setup sheet away mid-job.

Honest status: it's still in development. The whole flow works end to end (enroll a machine, upload, send, watch the job go to DONE, roll back, diff, receive)

There's more on the [product page](https://sampolabs.net/sampo/). If you run a shop and any of this sounds like your Tuesday, I'd genuinely like to hear how you move programs today.
