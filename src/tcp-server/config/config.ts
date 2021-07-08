export const cfg = {
    dbProduction: process.env.MONGO_URL || 'mongodb://192.168.100.7:27017/hyundaimobility_test',
    tcpPort: process.env.TCP_PORT || 9010,
    tcpPass: process.env.TCP_PASSWD || 'zafer'
};

export const postgreSqlCfg = {
    url: process.env.DATABASE_URL || 'postgresql://mta_add_log:qazwsxedcrfv@192.168.100.7:5432/MTA'
};

export const production = process.env.PRODUCTION === 'true';

export const debug = process.env.DEBUG === 'true';

export const appFilesDir = process.env.APP_FILES || '../files'
