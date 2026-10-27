import chalk, {type ChalkInstance} from 'chalk';


const Styles = {
    red: chalk.red,
    green: chalk.green,
    yellow: chalk.yellow,
    blue: chalk.blue,
    aqua: chalk.cyan,
    cyan: chalk.cyan,
    white: chalk.white,
    black: chalk.black,
    gray: chalk.gray,
    grey: chalk.gray,
    bold: chalk.bold,
    italic: chalk.italic,
    underline: chalk.underline,
    strikethrough: chalk.strikethrough,
    dim: chalk.dim
};

function parseStyle(s: string): ChalkInstance | undefined {
    if (Object.keys(Styles).includes(s)) {
        return Styles[s as keyof typeof Styles];
    }
    return undefined;
}

function getStyle(tag: string) {
    const style = parseStyle(tag.toLowerCase());
    if (style !== undefined) return style;
    else if (/^#[0-9a-fA-F]{6}$/.test(tag)) return chalk.hex(tag);
    return null;
}

type StackElement = {
    tag: string
    style: ChalkInstance | null
}

export function colorizeString(s: string) {
    const tokens = /<\/?([#\w]+)>/g;
    const stack: StackElement[] = [];
    let result: string = "";
    let lastIndex: number = 0;

    let match: RegExpExecArray | null;
    while ((match = tokens.exec(s)) !== null) {
        const [raw, tag] = match;
        const closing = raw.startsWith('</');
        if (tag === undefined) continue;
        const style = getStyle(tag);
        if (style === undefined) continue;

        const text = s.slice(lastIndex, match.index);

        result += stack.reduce(
            (value, entry) => {
                return entry.style ? entry.style(value) : "";
            },
            text
        );

        if (closing) {
            const stackMap = stack.map(entry => entry.tag);
            const index: number = stackMap.lastIndexOf(tag.toLowerCase());
            if (index !== -1) stack.splice(index);
        } else {
            stack.push({tag: tag.toLowerCase(), style});
        }

        lastIndex = tokens.lastIndex;
    }

    const tail = s.slice(lastIndex);

    result += stack.reduce(
        (value, entry) => {
            return entry.style ? entry.style(value) : "";
        },
        tail
    );

    return result;
}


//todo rewrite it to java syntax!
export function formatString(template: string, ...args: string[]) {
    let result = template;
    const simpleStringPattern = /%s(?!\d)/g;
    const simpleStringIndexPattern = /%s\d+/g;

    let i = 0;
    const simpleStringPatternMatch = template.match(simpleStringPattern);
    if (simpleStringPatternMatch !== null)
        for (const match of simpleStringPatternMatch) {
            if (i >= 0 && i < args.length) result = result.replace(match, String(args[i++]));
        }
    const simpleStringIndexPatternMatch = template.match(simpleStringIndexPattern);
    if (simpleStringIndexPatternMatch !== null)
        for (const match of simpleStringIndexPatternMatch) {
            let index: number = Number(match.replace("%s", ""));
            index--;
            if (index >= 0 && index < args.length) result = result.replace(match, String(args[index]));
        }
    return result;
}