export default function parseCommand(input: string): object | false {
	let splitString = input.match(/(?:[^\s"']+|['"][^'"]*["'])+/g); // thanks Jan
	splitString.forEach((el, i) => {
		if ((el.charAt(0) == '"' || el.charAt(0) == "'") && el.charAt(0) == el.charAt(el.length - 1)) {
			splitString[i] = el.substr(1, el.length - 2);
		}
	});
	return splitString;

	
}

console.log(parseCommand(`hello world "programmed to' love" and 'not to feel' hello world`));