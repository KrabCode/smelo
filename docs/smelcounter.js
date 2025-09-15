function getNextFriday1800CEST(now) {
    // CEST is UTC+2
    // Get current UTC time
    const utcNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    // Find next Friday
    let daysToFriday = (5 - utcNow.getUTCDay() + 7) % 7;
    if (daysToFriday === 0 && (utcNow.getUTCHours() > 16 || (utcNow.getUTCHours() === 16 && utcNow.getUTCMinutes() >= 0))) {
        daysToFriday = 7;
    }
    // Next Friday at 16:00 UTC (18:00 CEST)
    return new Date(Date.UTC(
        utcNow.getUTCFullYear(),
        utcNow.getUTCMonth(),
        utcNow.getUTCDate() + daysToFriday,
        16, 0, 0, 0
    ));
}

function getCestOrCetOffset(date) {
    // Central European Time (CET) is UTC+1, Central European Summer Time (CEST) is UTC+2
    // DST in Europe: last Sunday in March to last Sunday in October
    const year = date.getFullYear();
    // Last Sunday in March
    const startDST = new Date(Date.UTC(year, 2, 31));
    startDST.setUTCDate(31 - startDST.getUTCDay());
    // Last Sunday in October
    const endDST = new Date(Date.UTC(year, 9, 31));
    endDST.setUTCDate(31 - endDST.getUTCDay());
    if (date >= startDST && date < endDST) {
        return 2; // CEST (UTC+2)
    } else {
        return 1; // CET (UTC+1)
    }
}

let vibrateOffset = 2.0; // px, can be set to control vibration intensity

function injectVibrateCSS() {
    if (document.getElementById('vibrate-style')) return;
    const style = document.createElement('style');
    style.id = 'vibrate-style';
    style.textContent = `
    @keyframes vibrate {
      0% { transform: translate(0); }
      20% { transform: translate(-${vibrateOffset}px, ${vibrateOffset}px); }
      40% { transform: translate(-${vibrateOffset}px, -${vibrateOffset}px); }
      60% { transform: translate(${vibrateOffset}px, ${vibrateOffset}px); }
      80% { transform: translate(${vibrateOffset}px, -${vibrateOffset}px); }
      100% { transform: translate(0); }
    }
    .vibrate {
      animation: vibrate 0.2s linear infinite;
      display: inline-block;
    }
    `;
    document.head.appendChild(style);
}

function updateFridayCounter() {
    injectVibrateCSS();
    const now = new Date();
    // Determine if CEST or CET
    const cestOrCetOffset = getCestOrCetOffset(now);
    const cestNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + cestOrCetOffset * 60000 * 60);
    // ŠMELTIME window: next Friday 18:00 to next Saturday 03:00
    const smeltimeStart = getNextFriday1800CEST(now);
    const smeltimeEnd = new Date(smeltimeStart.getTime());
    smeltimeEnd.setDate(smeltimeEnd.getDate() + 1); // Saturday
    smeltimeEnd.setHours(3, 0, 0, 0); // 03:00 local time
    const isItSmeltime = cestNow >= smeltimeStart && cestNow < smeltimeEnd;
    const counterElem = document.getElementById('friday-counter');
    if (isItSmeltime) {
        counterElem.textContent = 'ŠMELTIME';
        counterElem.classList.add('vibrate');
        return;
    } else {
        counterElem.classList.remove('vibrate');
    }
    const nextFriday = getNextFriday1800CEST(now);
    let diff = nextFriday - now;
    if (diff < 0) diff = 0;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    let parts = [];
    if (days >= 1) {
      let dayLabel = '';
      if (days === 1) dayLabel = 'den';
      else if (days < 5) dayLabel = 'dny';
      else dayLabel = 'dní';
      parts.push(`${days} ${dayLabel}`);
    }
    if (hours >= 1 || days >= 1) {
      parts.push(`${String(hours)}h`);
    }
    if (minutes >= 1 || hours >= 1 || days >= 1) {
      parts.push(`${String(minutes)}m`);
    }
    parts.push(`${String(seconds)}s`);
    const text = `do pátečního večera zbývá: ${parts.join(' ')}`;
    document.getElementById('friday-counter').textContent = text;
}
setInterval(updateFridayCounter, 1000);
updateFridayCounter();
