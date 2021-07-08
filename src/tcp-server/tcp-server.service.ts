import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import * as NET from 'net';
import TcpServerConnectionsPool from './tcp-server.connections-pool';
import { cfg, debug, production } from './config/config';
const SERVER = NET.createServer();
const PORT = cfg.tcpPort;

@Injectable()
export class TcpServerService implements OnModuleInit{
    private logger = new Logger(TcpServerService.name);
    constructor(private POOL: TcpServerConnectionsPool) {
    }

    onModuleInit(): any {
        SERVER.on('connection', connection => {
            connection.setDefaultEncoding('binary');
            connection.setEncoding('binary');
            this.POOL.add(connection);
        });

// запуск сервера
        SERVER.listen(PORT, () => {
            this.logger.log(`TCP server is listening ${PORT}`);
            this.logger.log('DEBUG status: ' + debug);
            this.logger.log('Production status: ' + production);
        });

// try to detect error
        SERVER.on('error', (e) => {
            this.logger.error(`SERVER error ${e}`);
        });
    }
}
