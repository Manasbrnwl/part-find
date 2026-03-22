import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";

const LOG_DIR = path.join(process.cwd(), "logs");

/**
 * Custom format: timestamp + level + message + metadata
 */
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

/**
 * Colorized console format for development
 */
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
        return `${timestamp} ${level}: ${message}${metaStr}`;
    })
);

/**
 * Daily rotate file transport — rotates by date, max 14 days retention
 */
const fileRotateTransport = new DailyRotateFile({
    dirname: LOG_DIR,
    filename: "app-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    maxSize: "10m",
    maxFiles: "14d",
    format: logFormat,
});

/**
 * Error-only log file for quick triaging
 */
const errorFileTransport = new DailyRotateFile({
    dirname: LOG_DIR,
    filename: "error-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    maxSize: "10m",
    maxFiles: "30d",
    level: "error",
    format: logFormat,
});

const logger = winston.createLogger({
    level: isProduction ? "info" : "debug",
    transports: [
        new winston.transports.Console({
            format: isProduction ? logFormat : consoleFormat,
        }),
        fileRotateTransport,
        errorFileTransport,
    ],
    // Do not exit on uncaught exceptions — let the process manager handle it
    exitOnError: false,
});

/**
 * Morgan stream integration — pipe HTTP logs through Winston at "http" level
 */
const morganStream = {
    write: (message: string) => {
        logger.http(message.trim());
    },
};

export { logger, morganStream };
