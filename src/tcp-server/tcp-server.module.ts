import { Module } from '@nestjs/common';
import { TcpServerService } from './tcp-server.service';
import TcpServerConnectionsPool from './tcp-server.connections-pool';

@Module({
  providers: [TcpServerService, TcpServerConnectionsPool],
})
export class TcpServerModule {}
