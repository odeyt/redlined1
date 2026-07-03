'use strict';
const { createLogger, format, transports } = require('winston');
const path = require('path');

module.exports = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: path.join(__dirname, '../logs/bot.log'), maxsize: 5_000_000, maxFiles: 3 }),
  ],
});
