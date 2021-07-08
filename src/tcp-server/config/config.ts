export const CFG = {
  tcpPort: process.env.TCP_PORT || 9010,
  tcpPass: process.env.TCP_PASSWD || 'zafer',
};

export const production = process.env.PRODUCTION === 'true';

export const debug = process.env.DEBUG === 'true';
