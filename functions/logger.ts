type LoggerInputs = 'info'|'warn'|'err'|'ok'|'debug';
type LogTargets = 'debug'|'log'|'error';

enum consoleColors {
    Warning = '\x1b[33m',
    Error = '\x1b[31m',
    Info = '\x1b[36m',
    Ok = '\x1b[32m',
    Debug = '\x1b[35m',
    Reset = '\x1b[0m'
}


export function log(input : Error | string, message? : string) {
    // standard behaviour, shorthand for logger
    logger(input, message);
}
export function warn(input : Error | string, message? : string) {
    // forces logged input to be parsed as a warning
    logger(input, message, 'warn');
}
export function err(input : Error | string, message? : string) {
    // forces logged input to be parsed as an error
    logger(input, message, 'err');
}
export function info(input : Error | string, message? : string) {
    // forces logged input to be treated as info (standard log)
    logger(input, message, 'info');
}
export function ok(input : Error | string, message? : string) {
    // forces logged input to be treated as ack/ok 
    logger(input, message, 'ok');
}
export function debug(input : Error | string, message? : string) {
    // forces logged input to be treated as debug output
    logger(input, message, 'debug');
}

export function logger(input: Error | string, message?: string, type?: LoggerInputs) {
    let target : LogTargets = 'log';
    let toPrint = '';
    if (type) {
        switch (type) {
            case 'info':
                toPrint += `${consoleColors.Info}INFO${consoleColors.Reset}  `;
                break;
            case 'warn':
                toPrint += `${consoleColors.Warning}WARN${consoleColors.Reset}  `;
                break;
            case 'ok':
                toPrint += `${consoleColors.Ok}OK${consoleColors.Reset}    `;
                break;
            case 'debug':
                target = 'debug';
                toPrint += `${consoleColors.Debug}DEBUG${consoleColors.Reset} `
                break;
            case 'err':
                target = 'error';
                toPrint += `${consoleColors.Error}ERR${consoleColors.Reset}   `;
                break;
        }
    } else {
        if (input instanceof Error) {
            target = 'error';
            toPrint += `${consoleColors.Error}ERR${consoleColors.Reset}   `;
        }
        else toPrint += `${consoleColors.Info}INFO${consoleColors.Reset}  `;
    }
    if (message) toPrint += message + ' ';
    if (input instanceof Error) {
        toPrint += `${consoleColors.Error}${input.name}\n   Details:${consoleColors.Reset} ${input.message}`;
    }
    else { toPrint += `${input}`; }

    switch (target) {
        case 'debug': // only print to debug console level
            console.debug(toPrint);
            break;
        case 'log': // only print to log console level
            console.log(toPrint);
            break;
        case 'error': // TODO maybe check if there is a difference between stdout and stderr and then print to *both* 
            console.error(toPrint);
            break;
    }
}