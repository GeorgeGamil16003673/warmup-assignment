const fs = require("fs");

function parseTimeToSeconds(timeStr) {
  timeStr = timeStr.trim().toLowerCase();
  const parts = timeStr.split(" ");
  const timePart = parts[0];
  const period = parts[1];
  const [hStr, mStr, sStr] = timePart.split(":");
  let hours = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);
  const seconds = parseInt(sStr, 10);
  if (period === "am") {
    if (hours === 12) hours = 0;
  } else if (period === "pm") {
    if (hours !== 12) hours += 12;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function parseDurationToSeconds(durationStr) {
  durationStr = durationStr.trim();
  const [hStr, mStr, sStr] = durationStr.split(":");
  return parseInt(hStr, 10) * 3600 + parseInt(mStr, 10) * 60 + parseInt(sStr, 10);
}

function secondsToDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function secondsToTotalDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(3, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getShiftDuration(startTime, endTime) {
  const startSec = parseTimeToSeconds(startTime);
  const endSec = parseTimeToSeconds(endTime);
  return secondsToDuration(endSec - startSec);
}

function getIdleTime(startTime, endTime) {
  const startSec = parseTimeToSeconds(startTime);
  const endSec = parseTimeToSeconds(endTime);
  const deliveryStart = 8 * 3600;
  const deliveryEnd = 22 * 3600;
  let idleSec = 0;
  if (startSec < deliveryStart) {
    const idleBefore = Math.min(deliveryStart, endSec) - startSec;
    if (idleBefore > 0) idleSec += idleBefore;
  }
  if (endSec > deliveryEnd) {
    const idleAfter = endSec - Math.max(deliveryEnd, startSec);
    if (idleAfter > 0) idleSec += idleAfter;
  }
  return secondsToDuration(idleSec);
}

function getActiveTime(shiftDuration, idleTime) {
  const shiftSec = parseDurationToSeconds(shiftDuration);
  const idleSec = parseDurationToSeconds(idleTime);
  return secondsToDuration(shiftSec - idleSec);
}

function metQuota(date, activeTime) {
  const activeSec = parseDurationToSeconds(activeTime);
  const dateObj = new Date(date);
  const eidStart = new Date("2025-04-10");
  const eidEnd = new Date("2025-04-30");
  const quotaSec = (dateObj >= eidStart && dateObj <= eidEnd) ? 6 * 3600 : 8 * 3600 + 24 * 60;
  return activeSec >= quotaSec;
}

function addShiftRecord(textFile, shiftObj) {
  const { driverID, driverName, date, startTime, endTime } = shiftObj;
  let content = "";
  try {
    content = fs.readFileSync(textFile, "utf8");
  } catch (e) {
    content = "";
  }
  const lines = content.trim() === "" ? [] : content.trim().split("\n");
  for (const line of lines) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID && cols[2].trim() === date) return {};
  }
  const shiftDuration = getShiftDuration(startTime, endTime);
  const idleTime = getIdleTime(startTime, endTime);
  const activeTime = getActiveTime(shiftDuration, idleTime);
  const quota = metQuota(date, activeTime);
  const hasBonus = false;
  const newRecord = { driverID, driverName, date, startTime, endTime, shiftDuration, idleTime, activeTime, metQuota: quota, hasBonus };
  const newLine = `${driverID},${driverName},${date},${startTime},${endTime},${shiftDuration},${idleTime},${activeTime},${quota},${hasBonus}`;
  let insertIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const cols = lines[i].split(",");
    if (cols[0].trim() === driverID) { insertIndex = i; break; }
  }
  if (insertIndex === -1) {
    lines.push(newLine);
  } else {
    lines.splice(insertIndex + 1, 0, newLine);
  }
  fs.writeFileSync(textFile, lines.join("\n") + "\n", "utf8");
  return newRecord;
}

function setBonus(textFile, driverID, date, newValue) {
  const content = fs.readFileSync(textFile, "utf8");
  const lines = content.trim().split("\n");
  const updatedLines = lines.map((line) => {
    const cols = line.split(",");
    if (cols[0].trim() === driverID && cols[2].trim() === date) {
      cols[9] = newValue.toString();
      return cols.join(",");
    }
    return line;
  });
  fs.writeFileSync(textFile, updatedLines.join("\n") + "\n", "utf8");
}

function countBonusPerMonth(textFile, driverID, month) {
  const content = fs.readFileSync(textFile, "utf8");
  const lines = content.trim().split("\n");
  const targetMonth = parseInt(month, 10);
  let driverExists = false;
  let count = 0;
  for (const line of lines) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID) {
      driverExists = true;
      const recordMonth = parseInt(cols[2].trim().split("-")[1], 10);
      if (recordMonth === targetMonth && cols[9].trim().toLowerCase() === "true") count++;
    }
  }
  return driverExists ? count : -1;
}

function getTotalActiveHoursPerMonth(textFile, driverID, month) {
  const content = fs.readFileSync(textFile, "utf8");
  const lines = content.trim().split("\n");

  const targetMonth = parseInt(month, 10);
  let totalSeconds = 0;

  for (const line of lines) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID) {
      const dateStr = cols[2].trim();
      const recordMonth = parseInt(dateStr.split("-")[1], 10);
      if (recordMonth === targetMonth) {
        totalSeconds += parseDurationToSeconds(cols[7].trim());
      }
    }
  }

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
  const rateContent = fs.readFileSync(rateFile, "utf8");
  let dayOff = null;
  for (const line of rateContent.trim().split("\n")) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID) {
      dayOff = cols[1].trim();
      break;
    }
  }

  const shiftLines = fs.readFileSync(textFile, "utf8").trim().split("\n");
  const targetMonth = parseInt(month, 10);
  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  let totalRequiredSeconds = 0;

  for (const line of shiftLines) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID) {
      const dateStr = cols[2].trim();
      const [year, mon, day] = dateStr.split("-").map(Number);
      if (mon !== targetMonth) continue;

      const dateObj = new Date(year, mon - 1, day);
      if (dayNames[dateObj.getDay()] === dayOff) continue;

      const recordDate = new Date(dateStr);
      const eidStart = new Date("2025-04-10");
      const eidEnd = new Date("2025-04-30");
      totalRequiredSeconds += (recordDate >= eidStart && recordDate <= eidEnd)
        ? 6 * 3600
        : 8 * 3600 + 24 * 60;
    }
  }

  totalRequiredSeconds = Math.max(0, totalRequiredSeconds - bonusCount * 2 * 3600);

  const h = Math.floor(totalRequiredSeconds / 3600);
  const m = Math.floor((totalRequiredSeconds % 3600) / 60);
  const s = totalRequiredSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getNetPay(driverID, actualHours, requiredHours, rateFile) {
  const rateContent = fs.readFileSync(rateFile, "utf8");
  const rateLines = rateContent.trim().split("\n");
  let basePay = 0;
  let tier = 0;
  for (const line of rateLines) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID) {
      basePay = parseInt(cols[2].trim(), 10);
      tier = parseInt(cols[3].trim(), 10);
      break;
    }
  }
  const actualSec = parseDurationToSeconds(actualHours);
  const requiredSec = parseDurationToSeconds(requiredHours);
  if (actualSec >= requiredSec) return basePay;
  const allowedMissingHours = { 1: 50, 2: 20, 3: 10, 4: 3 };
  const allowedSec = (allowedMissingHours[tier] || 0) * 3600;
  const missingSec = requiredSec - actualSec;
  const billableHours = Math.floor(Math.max(0, missingSec - allowedSec) / 3600);
  const deductionRatePerHour = Math.floor(basePay / 185);
  return basePay - billableHours * deductionRatePerHour;
}

module.exports = {
  getShiftDuration,
  getIdleTime,
  getActiveTime,
  metQuota,
  addShiftRecord,
  setBonus,
  countBonusPerMonth,
  getTotalActiveHoursPerMonth,
  getRequiredHoursPerMonth,
  getNetPay,
};