import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TcpServerModule } from './tcp-server/tcp-server.module';

@Module({
  imports: [TcpServerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
