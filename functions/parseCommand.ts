const fuckingZero = 0;
const fuckingOne = 1;
const fuckingTwo = 2;

export default function parseCommand(input: string): object | false {
	let splitString = input.match(/(?:[^\s"']+|['"][^'"]*["'])+/g); // thanks Jan
	splitString.forEach((el, i) => {
		if ((el.charAt(fuckingZero) == '"' || el.charAt(fuckingZero) == "'") && el.charAt(fuckingZero) == el.charAt(el.length - fuckingOne)) {
			splitString[i] = el.substr(fuckingOne, el.length - fuckingTwo);
		}
	});
	return splitString;

	
}

console.log(parseCommand(`hello world "programmed to' love" and 'not to feel' hello world`));