import fs from "fs";
import slugify from "slugify";

export function ensureDirExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function generateRandomCode(code: string) {
  const prefix = code; //prefix of code "BUY" to Buyer and "SUP" to supplier and "LKR" to Buyer Supplier relationship
  const date = new Date();
  const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, "");
  const length = 16; //16 digit code generation
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let randomCode = prefix + formattedDate;

  for (let i = 0; i < length - randomCode.length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    randomCode += characters[randomIndex];
  }

  return randomCode;
}

export function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function convertNumberToWords(num: number) {
  if (num === 0) return "Zero rupees";

  const ones = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine"
  ];
  const teens = [
    "",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen"
  ];
  const tens = [
    "",
    "ten",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety"
  ];

  function getWords(n: number) {
    let str = "";
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + " hundred ";
      n %= 100;
    }
    if (n > 10 && n < 20) {
      str += teens[n - 10] + " ";
    } else {
      str += tens[Math.floor(n / 10)] + " ";
      str += ones[n % 10] + " ";
    }
    return str.trim();
  }

  let result = "";

  const lakh = Math.floor(num / 100000);
  num %= 100000;

  const thousand = Math.floor(num / 1000);
  num %= 1000;

  const hundred = num;

  if (lakh > 0) result += getWords(lakh) + " lakh ";
  if (thousand > 0) result += getWords(thousand) + " thousand ";
  if (hundred > 0) result += getWords(hundred);

  return result.trim() + " rupees";
}

export function getTimeDifference(time1: Date, time2: Date) {
  const date1 = new Date(time1);
  const date2 = new Date(time2);

  const differenceInMillis = Math.abs(date2.getTime() - date1.getTime());

  const seconds = Math.floor(differenceInMillis / 1000);
  const minutes = Math.floor(differenceInMillis / 1000 / 60);
  const hours = Math.floor(differenceInMillis / 1000 / 60 / 60);

  return {
    milliseconds: differenceInMillis,
    seconds: seconds,
    minutes: minutes,
    hours: hours
  };
}

async function generateUniqueSlug(username: string) {
  let slug = slugify(username, { lower: true, strict: true });
  // Check if slug exists
  return slug;
}
