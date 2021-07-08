import { Socket } from 'net';
import { Injectable, Logger } from '@nestjs/common';

interface IConnectionData extends Socket {
  ID?: string;
}

@Injectable()
export class TcpServerConnectionsPool {
  private logger = new Logger(TcpServerConnectionsPool.name);
  private connectionsArray: { [key: string]: IConnectionData } = {};

  add = (connection: IConnectionData) => {
    this.initEvents(connection);
  };

  initEvents = (connection: IConnectionData) => {
    connection.on('data', async (data: string) => {
      let json;
      try {
        json = JSON.parse(data.toString());
      } catch (e) {
        this.logger.verbose(data, `${connection?.ID}`);
      }
      if (json) {
        const dataObj: { id: string } = JSON.parse(data);
        this.logger.verbose(data);
        connection.ID = dataObj?.id.toString();
        this.connectionsArray[dataObj?.id] = connection;
        this.logger.verbose(
          Object.keys(this.connectionsArray).length,
          'Connection Length',
        );
      } else {
        this.logger.verbose(data, `${connection?.ID}`);
      }
    });

    connection.on('timeout', () => {
      this.logger.error(`timeout`);
    });

    connection.on('close', () => {
      this.logger.verbose(`close connection ${connection?.ID}`);
      delete this.connectionsArray[connection?.ID];
      this.logger.verbose(Object.keys(this.connectionsArray).length);
    });

    connection.on('error', () => {
      this.logger.verbose('error');
    });
  };
}

export default TcpServerConnectionsPool;
