import { Socket } from 'net';
import TcpServerDeviceDataService, { PacketType } from './tcp-server.device-data.service';
import TcpServerDecoderDataService from './tcp-server.decoder-data.service';
import { cfg, debug } from './config/config';
import { COMMAND_FIND_FAIL } from './const/commandForFindFail';
import { ParseDeviceInfo } from './shared/parse-device-info';
import { log } from './shared/logger';
import {Injectable, Logger} from "@nestjs/common";
import {TcpServerQueryService} from "./tcp-server.query.service";
import {EventsGateway} from "../socket-server/socket-server.geteway";
import {TcpServerIntervalQueryService} from "./tcp-server-interval.query.service";

interface IConnectionData extends Socket {
    ID?: string;
}

interface IPacketData {
    clientId?: string;
    pwd: string;
    id: string;
    cmd: string;
}

@Injectable()
export class TcpServerConnectionsPool {
    private logger = new Logger(TcpServerConnectionsPool.name);

    constructor(private DEVICE: TcpServerDeviceDataService,
                private DECODER: TcpServerDecoderDataService,
                private eventsGateway: EventsGateway,
                private tcpServerQueryService: TcpServerQueryService,
                private tcpServerIntervalQueryService: TcpServerIntervalQueryService
                ) {
    }

    private CONNECTIONS: { [id: string]: IConnectionData } = {};

    add = (connection: IConnectionData) => {
        this.initEvents(connection);
    }

    initEvents = (connection: IConnectionData) => {
        connection.on('data', async data => {
            let json: IPacketData | undefined = undefined;

            try {
                json = JSON.parse(data.toString());
            } catch (e) {
                // Silenty suppress errors
            }

            if (json) {
                this.logger.verbose(json);// Если данные которые пришли в пакете парсятся в json считаем
                // что подключение со стороны серверов иначе подключилась телематикка
                if (cfg.tcpPass === json.pwd) { //подключение со стороны сервера проверется паролем
                    this.tcpServerQueryService.saveConnectionLog(json, connection); //логируем подключение
                    if (json.clientId) {
                        connection.ID = json.clientId;
                        this.CONNECTIONS[connection.ID] = connection;
                    }

                    const  findedClient = this.sendTO(json.id, json.cmd); // отправляем комманду на устройство
                    if (findedClient !== 'true') {connection.write(JSON.stringify({error: findedClient})); } //отправляем инициатору сообшение результат выполенинея комманды
                } else {
                    connection.write(JSON.stringify({error: 'PASSWORD_NOT_GOOD'}));
                }
            } else { // считаем что подключилось устройство
                const typePacket = this.DEVICE.identificationPacket(data); // идентификация покета по косвенным признакам
                switch (typePacket) {
                    case PacketType.Canlog:
                        this.logger.log(data);
                        const deviceId = this.getID(data);
                        const status = data.indexOf('Success') !== -1 ? 'success' : 'error'
                        const res = data.toString( 'latin1' )
                            .split('&bin=')[1]
                            .replace('\/n', '');
                        this.logger.verbose(res);
                        this.tcpServerQueryService.changeStatusCanlog(
                            deviceId, status, res
                        );
                        return;    
                    case PacketType.Post:
                        connection.write('HTTP/1.1 100 Continue\r\n');
                        this.logger.log('HTTP/1.1 100 Continue\r\n');
                        return;

                    case PacketType.Other:
                        this.DEVICE.saveToDbConnection(connection?.ID).catch(e => {this.logger.error(e)})
                        if (debug) {this.logger.debug(`GET OTHER PAC DEVICE: ${connection.ID} DATA:  ${data}`)}
                        return;

                    case PacketType.RegInfo:
                        this.connectionManage(connection, data);
                        this.logger.log(`GET REGISTRATION PACkET ${connection.ID}, ${data}`);
                        const indexString = data.indexOf(' $reginfo');
                        const newData = data.slice(indexString).toString();
                        let count = parseInt('0', 2);
                        for (let elem  = 0; elem < newData.length - 1; elem++) {
                            count = count + newData.charCodeAt(elem);
                        }
                        let rez = (count.toString(2).slice(count.toString(2).length - 8));
                        rez = `0x${parseInt(rez, 2).toString(16)}`;
                        this.tcpServerQueryService.saveToDBnewDevice(newData);
                        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
                        // @ts-ignore
                        const ask = Buffer.from([0x20, rez]).toString('latin1');
                        const response = this.DEVICE.sendCommand(`#ACK#${ask}`);
                        this.sendTO(connection.ID, response);
                        this.logger.log(`Save New DEVICE ${connection.ID}`);
                        return;

                    case PacketType.Nfc:
                        this.logger.log(`GET NFC PACKET ${connection.ID}, ${data}`);
                        await this.connectionManage(connection, data);
                        this.createAndSendConfirmation(connection, data);
                        const indexStringNfc = data.indexOf(' nfc=');
                        const nfcData = data
                            .slice(indexStringNfc)
                            .toString()?.split('\n')[0]
                            .replace(' nfc=', '')
                            .replace('(', ',')
                            .replace(')', '')?.split(',');
                        this.logger.debug(nfcData);
                        this.tcpServerQueryService.addNfcInfo(nfcData, connection.ID);
                        this.responseParseFunction(connection, data).catch(e => this.logger.error(e));
                        return;

                    case PacketType.Response:
                        this.responseParseFunction(connection, data)
                            .catch(e => this.logger.error(e));
                        return;

                    case PacketType.Data:
                        this.connectionManage(connection, data);
                        const DEVICE = this.DECODER.start(data); // обычный пакет от устройства парсим
                        connection.write(DEVICE.confirmation);
                        this.DEVICE.saveToDB(DEVICE).catch(e => this.logger.error(e));
                        // if (debug) {log('INFO', 'DEVICE SAVED DATA PACKET'); }
                        return;
                    default:
                        throw 'E_UNKNOWN_PACKET';
                }

            }
        });

        connection.on('timeout', (data: any) => {
            this.logger.error(`SOCKET TIMEOUT id: ${connection.ID}  DATA: ${data}`);
        });

        connection.on('close', data => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
            // @ts-ignore
            if (!!this.CONNECTIONS[connection.ID]) {delete this.CONNECTIONS[connection.ID]; } // удаляем из массива коннектов отключившееся устройство
            this.tcpServerQueryService.saveConnectionLog({clientId: connection?.ID}, connection);
            this.eventsGateway.emmitDisconnectMessage(connection?.ID).catch(e => this.logger.error(e));

            this.logger.log(`disconnect device id: ${connection.ID}`);

        });
        connection.on('error', data => {
            if (data.message === 'read ETIMEDOUT') {
                connection.end()
            }
            this.logger.error(`ERROR device id: ${connection.ID}, DATA:, ${data}`);
        });
    }

    findConnectionData = (id: string) => {
        return this.CONNECTIONS[id];
    }

    sendTO = (id: string, cmd: string) => {
        const client = this.findConnectionData(id);
        if ('undefined' === typeof client) {
            this.logger.log(`NOTFOUND client ${id}`);
            this.tcpServerQueryService.saveCommandLog(id, cmd, `NOTFOUND client ${id}`); // log
            return `NOTFOUND client ${id}`
        } else {
            this.tcpServerQueryService.saveCommandLog(id, cmd, 'before send'); // log
            client.write(cmd);
            return 'true';
        }
    }

    createAndSendConfirmation = (connection, data) => {
        const cmdbuf = Buffer.from([0x20, 0x00]); // создаем подтверждение получения
        // Добавляем заголовки в сообщение
        const cmd = this.DEVICE.sendCommand('#ACK#' +
            cmdbuf.toString('latin1'));
        connection.write(cmd);
    }

    connectionManage = (connection, data) => {
        connection.ID = this.getID(data);
        if (!this.CONNECTIONS[connection.ID]) { // если коннект отсутствует в массиве коннектов
            if (debug) {this.logger.log(`CONNECT NEW DEVICE ${connection.ID}`); }
            this.logger.log(`CONNECTION LENGTH ${Object.keys(this.CONNECTIONS).length}`);
            this.tcpServerQueryService.saveConnectionLog({clientId: connection?.ID }, connection);
            this.CONNECTIONS[connection.ID] = connection;
            setTimeout(() => { // оправшиваем подключившеся устройства что бы понять активированное устройство или нет
                // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
                // @ts-ignore
                this.sendTO(connection.ID, this.DEVICE.sendCommand('#CMD#hml*actv#'));
            }, 2000);
        }
        this.CONNECTIONS[connection.ID] = connection; //обновляем свединья о коннекте !!!Важно
    }

    responseParseFunction = async (connection, data) => {
        this.connectionManage(connection, data);
        this.createAndSendConfirmation(connection, data);
        // Проверяем необходимость отправки GR
        const gr = await ParseDeviceInfo(data) ? '#CMD#123*gr=3#' : '';
        let responseWrite = false;
        if (gr.length) {
            responseWrite = connection.write(gr);
            this.logger.debug('INFO send gr=3 command to ' + connection.ID);
        }
        // получаем результат выполнения
        const initiatorwrite = data.toString('latin1')?.split('&bin= ')[1]?.split('\n')[0];
        // логируем
        this.tcpServerQueryService.saveCommandLog(connection?.ID, 'response', JSON.stringify({result: initiatorwrite.toString()}));

        //TODO Поменять для нового модуля управления
        const checkResultFail = initiatorwrite.toString().indexOf('FAIL') === -1 ?
            {result: initiatorwrite.toString()} :
            {error: 'Timeout command send', fail: initiatorwrite.toString()}

        if (COMMAND_FIND_FAIL.indexOf(initiatorwrite) !== -1) {
            setTimeout(() => {
                const initiatorEngStart = this.findConnectionData(connection.ID + 'S');

                if (initiatorEngStart) {
                    initiatorEngStart.write(JSON.stringify(checkResultFail));
                }
            }, 4001);
        } else {
            const initiator = this.findConnectionData(connection.ID + 'S');
            if (initiator) {
                initiator.write(JSON.stringify(checkResultFail));
            }
        }
    }

    getID = ( data: Buffer ) => {
        const strings = data.toString( 'latin1' )?.split( '&bin=' );
        const exid = strings[0]?.split( 'id=' );
        return exid[1];
    }
}

export default TcpServerConnectionsPool;
