import { logger } from './../functions/logger';
function test_logger() : void {
    logger(new TypeError('foo'));
    logger(new EvalError('foo'), 'big heck');
    logger(new Error('bar'), 'hello', 'warn');
    logger('baz');
    logger('hello world', 'programmed to love');
    logger('this should go to debug', 'but not to feel', 'debug');
    logger('info text', 'hi i\'m stdout', 'info');
    logger('this should go to warn', 'hello world', 'warn');
    logger('oh no an error!','oh god oh HECK', 'err');
    logger('something worked', 'good job', 'ok')
}
