const csv = require('ya-csv');
const fs = require('fs');
const path = require('path');
const dateFormat = require('dateformat');
const stripe = require('stripe');
const config = require('./config');

const now = new Date();
const startDayTimestamp = Math.floor(Date.UTC(now.getUTCFullYear(),
  now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0) / 1000);
const endDayTimestamp = startDayTimestamp + (24 * 60 * 60);
const transactionsFilter = {
  created: {
    gte: startDayTimestamp,
    lt: endDayTimestamp,
  },
};

if (!fs.existsSync(config.companiesDataInputFile)) {
  console.log('Please set the correct path to: ',
    config.companiesDataInputFile);
  process.exit(1);
}

if (!fs.existsSync(config.companiesDataOutputFolder)) {
  console.log('Please set the correct path to out folder or create it: ',
    config.companiesDataOutputFolder);
  process.exit(1);
}

const reader = csv.createCsvFileReader(config.companiesDataInputFile);

let firstLine = true;
reader.addListener('data', (data) => {
  if (firstLine) {
    firstLine = false;
  } else if (data.length < 2) {
    console.log(`CSV folder section for line '${data}' is missed.`);
  } else {
    const outDir = path.join(config.companiesDataOutputFolder, data[2]);

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir);
    }

    const dateUTC = dateFormat(new Date().toUTCString(), config.dateFormatTemplate);
    const outFileName = path.join(outDir, `${config.fileNamePrefix}${dateUTC}.csv`);

    if (fs.existsSync(outFileName)) {
      fs.unlinkSync(outFileName);
    }

    const writer = csv.createCsvStreamWriter(fs.createWriteStream(outFileName));
    // .csv file title
    writer.writeRecord([
      'DATE',
      'Amount',
      'Description',
      'Reference',
      'Type',
      'Email (meta)',
      'Name (meta)',
    ]);

    const stripeAcc = stripe(data[1]);
    console.log(`Processing company name: ${data[0]}`);

    stripeAcc.balance
        .listTransactions(transactionsFilter)
        .then((transactions) => {
          transactions.data.forEach((item) => {
            let email = '';
            let name = '';
            if (item.metadata) {
              if (item.metadata.email) {
                email = item.metadata.email;
              }
              if (item.metadata.name) {
                name = item.metadata.name;
              }
            }

            const outAmountJson = [
              dateFormat(new Date(item.created * 1000).toUTCString(),
                config.dateFormatTemplate),
              item.amount / 100,
              item.description,
              item.source,
              item.type,
              email,
              name,
            ];

            const outFeeJson = [
              dateFormat(new Date(item.created * 1000).toUTCString(),
                config.dateFormatTemplate),
              -item.fee / 100,
              'Stripe fee',
              item.source,
              item.type,
              email,
              name,
            ];

            writer.writeRecord(outAmountJson);
            writer.writeRecord(outFeeJson);
          });
        });
  }
});

reader.addListener('error', (e) => {
  console.error(`Something wrong with input file: ${config.companiesDataInputFile}`);
  console.log(`The error is: ${e}`);
});
