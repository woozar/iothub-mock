import * as express from 'express';
import { readFileSync } from 'fs';
import { createServer } from 'https';

const app = express();
app.use(express.json());

const httpPort = process.env.HTTP_PORT ?? '80';
const httpsPort = process.env.HTTPS_PORT ?? '443';
const silent = process.env.SILENT === 'true';

interface Device {
  registeredMethods: DirectMethod[];
  twin: Twin;
}

interface DirectMethod {
  moduleName?: string;
  methodName: string;
  callHistory: any[];
  responses: DirectMethodResponse[];
}

interface DirectMethodResponse {
  count: number;
  status: number;
  payload: any;
}

interface Twin {
  value: any;
  history: any[];
}

let devices: Record<string, Device> = {};

app.get('/health', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200);
  res.send({});
});

app.get('/manage-api/cert', (_req, res) => {
  res.setHeader('Content-Type', 'application/x-pem-file');
  res.status(200);
  res.send(readFileSync('server.cert'));
});

app.post('/twins/:deviceId/modules/:moduleName/methods', (req, res) => {
  const { deviceId, moduleName } = req.params;
  if (!silent) console.log(`Incoming direct-method-call for device: ${deviceId}/${moduleName} => ${req.body}`);
  const device = devices[deviceId];
  if (!device) {
    console.error(`tried to invoke direct method: unknown deviceId ${deviceId}`);
    res.status(404);
    res.send({ message: 'unknown deviceId' });
    return;
  }

  const { methodName } = req.body;
  const method = device.registeredMethods.find((m) => m.moduleName === moduleName && m.methodName === methodName);
  if (!method) {
    console.error(`tried to invoke direct method: unknown method ${moduleName}/${methodName}`);
    res.status(404);
    res.send({ message: 'unknown method' });
    return;
  }
  if (!method.responses.length) {
    console.error(`tried to invoke direct method: no recorded response ${moduleName}/${methodName}`);
    res.status(404);
    res.send({ message: 'no response known' });
    return;
  }

  const response = method.responses[0];
  if (response.count > 1) {
    response.count--;
  } else if (response.count === 1) {
    method.responses.splice(0, 1);
  }

  method.callHistory.push(req.body);

  res.status(200);
  const { status, payload } = response;
  res.send({ status, payload });
});

app.post('/twins/:deviceId/methods', (req, res) => {
  const { deviceId } = req.params;
  if (!silent) console.log(`Incoming direct-method-call for device: ${deviceId} => ${JSON.stringify(req.body)}`);
  const device = devices[deviceId];
  if (!device) {
    console.error(`tried to invoke direct method: unknown deviceId ${deviceId}`);
    res.status(404);
    res.send({ message: 'unknown deviceId' });
    return;
  }

  const method = device.registeredMethods.find(
    (m) => m.moduleName === undefined && m.methodName === req.body.methodName
  );
  if (!method) {
    console.error(`tried to invoke direct method: unknown method undefined/${req.body.methodName}`);
    res.status(404);
    res.send({ message: 'unknown method' });
    return;
  }
  if (!method.responses.length) {
    console.error(`tried to invoke direct method: no recorded response undefined/${req.body.methodName}`);
    res.status(404);
    res.send({ message: 'no response known' });
    return;
  }

  const response = method.responses[0];
  if (response.count > 1) {
    response.count--;
  } else if (response.count === 1) {
    method.responses.splice(0, 1);
  }

  method.callHistory.push(req.body);

  res.status(200);
  const { status, payload } = response;
  res.send({ status, payload });
});

app.put('/manage-api/devices/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  if (!silent) console.log(`create device ${deviceId} =>  ${JSON.stringify(req.body)}`);
  devices[deviceId] = {
    registeredMethods: [],
    twin: {
      history: [],
      value: req.body,
    },
  };

  res.setHeader('Content-Type', 'application/json');
  res.status(200);
  res.send({});
});

app.put('/manage-api/devices/:deviceId/twin', (req, res) => {
  const { deviceId } = req.params;
  if (!silent) console.log(`update twin for ${deviceId} => ${JSON.stringify(req.body)}`);
  const device = devices[req.params.deviceId];
  if (!device) {
    res.status(404);
    res.send({ message: `Could not find the device with deviceId ${deviceId}` });
  }

  device.twin.value = req.body;

  res.setHeader('Content-Type', 'application/json');
  res.status(200);
  res.send({});
});

app.put('/manage-api/devices/:deviceId/direct-method-response/methods/:methodName', (req, res) => {
  const { deviceId, methodName } = req.params;
  if (!silent) console.log(`add direct method response for ${deviceId}/${methodName} => ${JSON.stringify(req.body)}`);
  const device = devices[req.params.deviceId];
  if (!device) {
    res.status(404);
    res.send({ message: `Could not find the device with deviceId ${deviceId}` });
  }

  let method = device.registeredMethods.find((m) => m.methodName === methodName && m.moduleName === undefined);

  if (!method) {
    method = {
      methodName,
      callHistory: [],
      responses: [req.body],
    };
    device.registeredMethods.push(method);
  }
  method.responses.push(req.body);

  res.setHeader('Content-Type', 'application/json');
  res.status(200);
  res.send({});
});

app.put('/manage-api/devices/:deviceId/direct-method-response/modules/:moduleName/methods/:methodName', (req, res) => {
  const { deviceId, methodName, moduleName } = req.params;
  if (!silent)
    console.log(
      `add direct method response for ${deviceId}/${moduleName}/${methodName} => ${JSON.stringify(req.body)}`
    );
  const device = devices[req.params.deviceId];
  if (!device) {
    res.status(404);
    res.send({ message: `Could not find the device with deviceId ${deviceId}` });
  }

  let method = device.registeredMethods.find((m) => m.methodName === methodName && m.moduleName === moduleName);

  if (!method) {
    method = { methodName, moduleName, callHistory: [], responses: [req.body] };
    device.registeredMethods.push(method);
  }
  method.responses.push(req.body);

  res.setHeader('Content-Type', 'application/json');
  res.status(200);
  res.send({});
});

app.post('/manage-api/clear', (_req, res) => {
  if (Object.keys(devices).length > 0) {
    if (!silent) console.log(`clear all devices`);
    devices = {};
  }
  res.setHeader('Content-Type', 'application/json');
  res.status(200);
  res.send({});
});

app.post('/manage-api/devices/:deviceId/clear', (req, res) => {
  if (devices[req.params.deviceId]) {
    if (!silent) console.log(`clear all direct method calls for device: ${req.params.deviceId}`);
    delete devices[req.params.deviceId];
  }
  res.setHeader('Content-Type', 'application/json');
  res.status(200);
  res.send({});
});

app.get('/manage-api/devices/:deviceId/twin', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(devices[req.params.deviceId] ? 200 : 404);
  res.send(devices[req.params.deviceId]?.twin.history ?? []);
});

app.get('/manage-api/devices/:deviceId/direct-method-calls', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200);
  const methods = devices[req.params.deviceId]?.registeredMethods.filter((m) => m.moduleName === undefined) ?? [];
  res.send(
    methods.reduce((prev, curr) => {
      prev[curr.methodName] = curr.callHistory;
      return prev;
    }, {})
  );
});

app.get('/manage-api/devices/:deviceId/modules/:moduleName/direct-method-calls', (req, res) => {
  const { deviceId, moduleName } = req.params;
  res.setHeader('Content-Type', 'application/json');
  res.status(200);
  const methods = devices[deviceId]?.registeredMethods.filter((m) => m.moduleName === moduleName) ?? [];
  res.send(
    methods.reduce((prev, curr) => {
      prev[curr.methodName] = curr.callHistory;
      return prev;
    }, {})
  );
});

function printUnknownRequest({
  method,
  url,
  baseUrl,
  originalUrl,
  params,
  query,
  headers,
  hostname,
  body,
}: express.Request<{}, any, any, any, Record<string, any>>): void {
  console.error(
    `Unknown request: ${JSON.stringify({ method, url, baseUrl, originalUrl, params, query, headers, hostname, body })}`
  );
}

app.post('*', (req, res) => {
  printUnknownRequest(req);
  res.status(200);
  res.send({});
});

app.get('*', (req, res) => {
  printUnknownRequest(req);
  res.status(200);
  res.send({});
});

app.put('*', (req, res) => {
  printUnknownRequest(req);
  res.status(200);
  res.send({});
});

app.listen(httpPort, () => {
  if (!silent) console.log(`SignalR Mock listen unencrypted on ${httpPort}`);
});

createServer({ key: readFileSync('server.key'), cert: readFileSync('server.cert') }, app).listen(httpsPort, () => {
  if (!silent) console.log(`SignalR Mock listen encrypted on ${httpsPort}`);
});
