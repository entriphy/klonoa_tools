export class BScript {
    public static readonly DEFAULT_VERSION: number = 0x20080306;

    // Header
    public version: number;
    private _size: number;
    private _dataOffset: number;
    public isValid: boolean;
    
    // Data
    public data: BScriptData;

    constructor(type: BScriptType, buffer: ArrayBuffer) {
        const dataView = new DataView(buffer);
        this.version = dataView.getUint32(0x00);
        this._size = dataView.getUint32(0x04);
        this._dataOffset = dataView.getUint32(0x08);
        this.isValid = dataView.getUint32(0x0C) == 1; // Set internally by the game, this will equal false

        if (this.version != BScript.DEFAULT_VERSION)
            throw "Invalid BScript file (version does not match)";
        else
            this.isValid = true;
        this.data = new BScriptData(type, buffer, this._dataOffset);
    }

    public get size() {
        return this._size;
    }

    public get dataOffset() {
        return this._dataOffset;
    }

    deserialize(): ArrayBuffer {
        let buffer: number[] = [];
        let dataView = new DataView(new ArrayBuffer(4));
        const expectedSize = this.calculateSize()

        // Write header
        this.writeUint32(BScript.DEFAULT_VERSION, buffer, dataView);
        this.writeUint32(expectedSize, buffer, dataView);
        this.writeUint32(0x10, buffer, dataView);
        this.writeUint32(0, buffer, dataView);

        // Write counts
        this.writeUint16(this.data.labelIndexCount, buffer, dataView);
        this.writeUint16(this.data.actionLabelIndexCount, buffer, dataView);
        this.writeUint16(this.data.commandCount, buffer, dataView);
        this.writeUint16(this.data.searchStringCount, buffer, dataView);

        // Write offsets
        const commandTableOffset = 0x30;
        this.writeUint32(commandTableOffset, buffer, dataView);

        let commandsOffset = commandTableOffset + this.data.commandCount * 0x04;
        this.writeUint32(commandsOffset, buffer, dataView);

        let labelIndicesOffset = commandsOffset;
        this.data.commands.forEach((command) => labelIndicesOffset += command.calculateSize());
        this.writeUint32(labelIndicesOffset, buffer, dataView);

        const actionLabelIndicesOffset = labelIndicesOffset + this.data.labelIndexCount * 0x02;
        this.writeUint32(actionLabelIndicesOffset, buffer, dataView);

        // let stringsOffset = actionLabelIndicesOffset + this.calculateStringTableSize();
        let stringsOffset = actionLabelIndicesOffset + this.data.actionLabelIndexCount * 0x02;
        this.writeUint32(stringsOffset, buffer, dataView);

        const searchStringsOffset = stringsOffset + this.calculateStringTableSize();
        this.writeUint32(searchStringsOffset, buffer, dataView);

        // Write data
        let strings: { [str: string]: number } = {}
        this.data.commands.forEach((command) => {
            this.writeUint32(commandsOffset, buffer, dataView);
            commandsOffset += command.calculateSize();
        });
        this.data.commands.forEach((command) => {
            this.writeUint16(command.frame, buffer, dataView);
            this.writeUint16(command.instruction, buffer, dataView);
            command.arguments.forEach((arg) => {
                switch (arg.type) {
                    case ArgumentType.uint16:
                        this.writeUint16(arg.value, buffer, dataView);
                        break;
                    case ArgumentType.float:
                        this.writeFloat(arg.value, buffer, dataView);
                        break;
                    case ArgumentType.string:
                        if (!(arg.value in strings)) {
                            let stringSize = 0;
                            if (arg.value == "") {
                                strings[arg.value] = stringsOffset;
                                if (stringsOffset % 2 === 1) {
                                    stringSize = 1;
                                } else {
                                    stringSize = 2;
                                }
                            } else {
                                if (stringsOffset % 2 === 1) {
                                    stringsOffset += 1;
                                }
                                strings[arg.value] = stringsOffset;
                                stringSize += (arg.value as string).length + 1;
                            }
                            stringsOffset += stringSize;
                        }
                        this.writeUint32(strings[arg.value], buffer, dataView);
                        break;
                }
            });
            if (buffer.length % 4 !== 0) {
                this.writeUint16(0xEEEE, buffer, dataView);
            }
        });
        this.data.labelIndices.forEach((label) => this.writeUint16(label, buffer, dataView));
        this.data.actionLabelIndices.forEach((label) => this.writeUint16(label, buffer, dataView));
        Object.keys(strings).forEach((str) => {
            if (str === "") {
                if (buffer.length % 2 == 1) {
                    this.writeUint8(0x00, buffer, dataView);
                } else {
                    this.writeUint16(0x00EE, buffer, dataView);
                }
            } else {
                if (buffer.length % 2 == 1) {
                    this.writeUint8(0xEE, buffer, dataView);
                }
                this.writeString(str, buffer, dataView);
            }
        });
        if (buffer.length % 2 == 1) {
            this.writeUint8(0xEE, buffer, dataView);
        }
        this.data.searchStrings.forEach((str) => this.writeUint16(str, buffer, dataView));

        return Uint8Array.from(buffer).buffer;
    }

    private calculateStringTableSize(): number {
        let size = 0;
        let strings = [];
        this.data.searchStringsStrings.forEach(str => {
            if (!strings.includes(str)) {
                if (size % 2 == 1) {
                    size += 1;
                    if (str === "") {
                        return;
                    }
                }
                strings.push(str);
                size += str.length + 1;
            }
        });
        if (size % 2 == 1) {
            size += 1;
        }
        return size;
    }

    public calculateSize(): number {
        let size = 0x30; // Header
        // console.log("Command table offset: " + size);
        size += this.data.commandCount * 0x04;
        // console.log("Commands offset: " + size);
        this.data.commands.forEach((command) => size += command.calculateSize());
        // console.log("Label indices offset: " + size);
        size += this.data.labelIndexCount * 0x02;
        // console.log("Action label indices offset: " + size);
        size += this.data.actionLabelIndexCount * 0x02;
        // console.log("Strings offset: " + size);
        size += this.calculateStringTableSize();
        // console.log("Search strings offset: " + size);
        size += this.data.searchStringCount * 0x02;
        return size;
    }

    private writeUint8(value: number, buffer: number[], dataView: DataView) {
        dataView.setUint8(0x00, value);
        buffer.push(dataView.getUint8(0x00));
    }

    private writeUint16(value: number, buffer: number[], dataView: DataView) {
        dataView.setUint16(0x00, value);
        buffer.push(dataView.getUint8(0x00));
        buffer.push(dataView.getUint8(0x01));
    }

    private writeUint32(value: number, buffer: number[], dataView: DataView) {
        dataView.setUint32(0x00, value);
        buffer.push(dataView.getUint8(0x00));
        buffer.push(dataView.getUint8(0x01));
        buffer.push(dataView.getUint8(0x02));
        buffer.push(dataView.getUint8(0x03));
    }

    private writeFloat(value: number, buffer: number[], dataView: DataView) {
        dataView.setFloat32(0x00, value);
        buffer.push(dataView.getUint8(0x00));
        buffer.push(dataView.getUint8(0x01));
        buffer.push(dataView.getUint8(0x02));
        buffer.push(dataView.getUint8(0x03));
    }

    private writeString(value: string, buffer: number[], dataView: DataView) {
        for (let i = 0; i < value.length; i++) {
            buffer.push(value.charCodeAt(i));
        }
        buffer.push(0x00);
    }
}

class BScriptData {
    // Counts
    private _labelIndexCount: number;
    private _actionLabelIndexCount: number;
    private _commandCount: number;
    private _searchStringCount: number;

    // Offsets
    private _commandOffsetsOffset: number;
    private _commandsOffset: number;
    private _labelIndicesOffset: number;
    private _actionLabelIndicesOffset: number;
    private _stringsOffset: number;
    private _searchStringsOffset: number;

    // Data
    private _labelIndices: number[];
    private _actionLabelIndices: number[];
    private _commandOffsets: number[];
    private _commands: BScriptCommand[];
    private _searchStrings: number[];
    private _searchStringsOffsets: number[];
    private _searchStringsStrings: string[]; // this is a really dumb name

    constructor(type: BScriptType, buffer: ArrayBuffer, offset: number) {
        let dataView = new DataView(buffer, offset);

        // Counts (u16)
        this._labelIndexCount = dataView.getUint16(0x00);
        this._actionLabelIndexCount = dataView.getUint16(0x02);
        this._commandCount = dataView.getUint16(0x04);
        this._searchStringCount = dataView.getUint16(0x06);

        // Offsets (u32)
        this._commandOffsetsOffset = dataView.getUint32(0x08);
        this._commandsOffset = dataView.getUint32(0x0C);
        this._labelIndicesOffset = dataView.getUint32(0x10);
        this._actionLabelIndicesOffset = dataView.getUint32(0x14);
        this._stringsOffset = dataView.getUint32(0x18);
        this._searchStringsOffset = dataView.getUint32(0x1C);

        // Read data from offsets
        dataView = new DataView(buffer);
        this._labelIndices = []
        for (let i = 0; i < this._labelIndexCount; i++)
            this._labelIndices[i] = dataView.getUint16(this._labelIndicesOffset + (i * 2));
        this._actionLabelIndices = []
        for (let i = 0; i < this._actionLabelIndexCount; i++)
            this._actionLabelIndices[i] = dataView.getUint16(this._actionLabelIndicesOffset + (i * 2));
        
        this._searchStrings = [];
        this._searchStringsOffsets = [];
        this._searchStringsStrings = [];
        for (let i = 0; i < this._searchStringCount; i++) {
            this._searchStrings[i] = dataView.getUint16(this._searchStringsOffset + (i * 2));
            this._searchStringsOffsets[i] = dataView.getUint32(this._commandsOffset + this._searchStrings[i])
            this._searchStringsStrings[i] = this.getString(dataView, this._searchStringsOffsets[i]);
        }

        this._commandOffsets = [];
        this._commands = [];
        for (let i = 0; i < this._commandCount; i++) {
            this._commandOffsets[i] = dataView.getUint32(this._commandOffsetsOffset + (i * 4));
            this._commands[i] = new BScriptCommand(type, buffer, this._commandOffsets[i])
        }
    }

    public get labelIndexCount() {
        return this._labelIndexCount;
    }

    public get actionLabelIndexCount() {
        return this._actionLabelIndexCount;
    }

    public get commandCount() {
        return this._commandCount;
    }

    public get searchStringCount() {
        return this._searchStringCount;
    }

    public get commandsOffset() {
        return this._commandsOffset;
    }

    public get commandOffsets(): readonly number[] {
        return this._commandOffsets;
    }

    public get labelIndices(): readonly number[] {
        return this._labelIndices;
    }

    public get actionLabelIndices(): readonly number[] {
        return this._actionLabelIndices;
    }

    public get commands(): readonly BScriptCommand[] {
        return this._commands;
    }

    public get searchStrings(): readonly number[] {
        return this._searchStrings;
    }

    public get searchStringsOffsets(): readonly number[] {
        return this._searchStringsOffsets;
    }

    public get searchStringsStrings(): readonly string[] {
        return this._searchStringsStrings;
    }

    public searchStringToCommand(searchString: number): BScriptCommand | undefined {
        const offset = searchString + this._commandsOffset;
        for (let i = 0; i < this.commandCount; i++) {
            if (this._commandOffsets[i] > offset) {
                return this._commands[i - 1]; // lol
            }
        }
        return undefined;
    }

    private getString(dataView: DataView, offset: number): string {
        let res: string = "";
        let buffer = new DataView(dataView.buffer);
        let char = buffer.getUint8(offset);
        while (char != 0x00) {
            res += String.fromCharCode(char);
            offset += 1;
            char = buffer.getUint8(offset);
        }
        return res;
    }
}

export class BScriptCommand {
    public frame: number;
    private _nInstruction: number;
    private actionCommand: ActionCommand;
    private demoCommand: DemoCommand;
    private fieldCommand: FieldCommand;
    private _arguments: BScriptCommandArgument[];
    private type: BScriptType;

    constructor(type: BScriptType, buffer: ArrayBuffer, offset: number) {
        this.type = type;
        this._arguments = [];

        const dataView = new DataView(buffer, offset);
        this.frame = dataView.getUint16(0x00);
        this._nInstruction = dataView.getUint16(0x02);
        switch (type) {
            case BScriptType.Action:
                this.actionCommand = this._nInstruction;
                this.parseActionArguments(dataView);
                break;
            case BScriptType.Demo:
                this.demoCommand = this._nInstruction;
                this.parseDemoArguments(dataView);
                break;
            case BScriptType.Field:
                this.fieldCommand = this._nInstruction;
                this.parseFieldArguments(dataView)
                break;
        }
    }

    public get instruction(): ActionCommand | DemoCommand | FieldCommand {
        switch (this.type) {
            case BScriptType.Action:
                return this.actionCommand;
            case BScriptType.Demo:
                return this.demoCommand;
            case BScriptType.Field:
                return this.fieldCommand;
        }
    }

    public get instructionString(): string {
        switch (this.type) {
            case BScriptType.Action:
                return ActionCommand[this.actionCommand];
            case BScriptType.Demo:
                return DemoCommand[this.demoCommand];
            case BScriptType.Field:
                return FieldCommand[this.fieldCommand];
        }
    }

    public get arguments(): readonly BScriptCommandArgument[] {
        return this._arguments;
    }

    public calculateSize(): number {
        let size = 4;
        this._arguments.forEach(argument => {
            switch (argument.type) {
                case ArgumentType.uint16:
                    size += 2;
                    break;
                case ArgumentType.float:
                    size += 4;
                    break;
                case ArgumentType.string:
                    size += 4;
                    break;
            }
        });
        if (size % 4 != 0)
            size += 2;
        return size;
    }

    public toString(): string {
        let res = [];
        this._arguments.forEach((arg) => res.push(`${arg.name}: ` + (arg.type == ArgumentType.string ? `"${arg.value}"` : arg.value)))
        return `${this.instructionString}(${res.join(", ")})`;
    }

    private getString(dataView: DataView, offset: number): string {
        let res: string = "";
        let buffer = new DataView(dataView.buffer);
        let char = buffer.getUint8(offset);
        while (char != 0x00) {
            res += String.fromCharCode(char);
            offset += 1;
            char = buffer.getUint8(offset);
        }
        return res;
    }

    private parseActionArguments(dataView: DataView) {
        switch (this.actionCommand) {
            case ActionCommand.Start:
                break;
            case ActionCommand.End:
                break;
            case ActionCommand.Loop:
                break;
            case ActionCommand.Pause:
                break;
            case ActionCommand.Jump:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case ActionCommand.Print:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "message", this.getString(dataView, dataView.getUint32(4))));
                break;
            case ActionCommand.Assert:
                break;
            case ActionCommand.ResetFrame:
                break;
            case ActionCommand.Call:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case ActionCommand.CallUserProgram:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(4)));
                break;
            case ActionCommand.SetUserValue:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "value", dataView.getFloat32(4)));
                break;
            case ActionCommand.ChangeAction:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case ActionCommand.Animation:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interpolateTime", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationNumber", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationType", dataView.getUint16(12)));
                break;
            case ActionCommand.AnimationWithoutSameNumber:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interpolateTime", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationNumber", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationType", dataView.getUint16(12)));
                break;
            case ActionCommand.AnimationByUserValue:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interpolateTime", dataView.getFloat32(4)));
                break;
            case ActionCommand.AnimationFrame:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                break;
            case ActionCommand.WaitAnimation:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "value", dataView.getFloat32(4)));
                break;
            case ActionCommand.JumpIfAnimationNumber:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationNumber", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "targetLabel", dataView.getUint16(8)));
                break;
            case ActionCommand.FacialNumber:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "facialTarget", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interpolateTime", dataView.getFloat32(8)));
                break;
            case ActionCommand.FacialAnimation:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "facialTarget", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                break;
            case ActionCommand.AnimationWithEclipse:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interpolateTime", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationNumber", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationNumberOfEclipse", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationType", dataView.getUint16(14)));
                break;
            case ActionCommand.AnimationWithoutSameNumberWithEclipse:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interpolateTime", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationNumber", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationNumberOfEclipse", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationType", dataView.getUint16(14)));
                break;
            case ActionCommand.SetOnGround:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "underY", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "offsetDegreeY", dataView.getFloat32(8)));
                break;
            case ActionCommand.EnableObjectCollision:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(4)));
                break;
            case ActionCommand.SetObjectCollisionSphere:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "radius", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "offsetToCenterX", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "offsetToCenterY", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "offsetToCenterZ", dataView.getFloat32(16)));
                break;
            case ActionCommand.SetObjectCollisionSegment:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "radius", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "v0x", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "v0y", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "v0z", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "v1x", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "v1y", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "v1z", dataView.getFloat32(28)));
                break;
            case ActionCommand.InvincibilityTime:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(4)));
                break;
            case ActionCommand.HitPoint:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "value", dataView.getFloat32(4)));
                break;
            case ActionCommand.IsStillAlive:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case ActionCommand.IsNotStillAlive:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case ActionCommand.IsNoDamage:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case ActionCommand.IsResistCapture:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(4)));
                break;
            case ActionCommand.IsRideable:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(4)));
                break;
            case ActionCommand.IsDangleable:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(4)));
                break;
            case ActionCommand.IsGiant:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(4)));
                break;
            case ActionCommand.EnableNockBack:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(4)));
                break;
            case ActionCommand.EnableThroughEnemy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(4)));
                break;
            case ActionCommand.NoDamage:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(4)));
                break;
            case ActionCommand.IsTranslucent:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(4)));
                break;
            case ActionCommand.SetPathBindPolicy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "policy", dataView.getUint16(4)));
                break;
            case ActionCommand.SetGroundCheckPolicy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "policy", dataView.getUint16(4)));
                break;
            case ActionCommand.SetLookAtPolicy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "policy", dataView.getUint16(4)));
                break;
            case ActionCommand.SetRotatePolicy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "policy", dataView.getUint16(4)));
                break;
            case ActionCommand.JumpIfActionMode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(8)));
                break;
            case ActionCommand.WaitIfActionMode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(6)));
                break;
            case ActionCommand.SetActionMode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case ActionCommand.AddActionMode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case ActionCommand.PlayerIfEnemyCaptured:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case ActionCommand.PlayerIfNotEnemyCaptured:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case ActionCommand.PlayerIfDangling:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case ActionCommand.PlayerIfNotDangling:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case ActionCommand.PlayerIfOnSlideFloor:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case ActionCommand.PlayerIfNotOnSlideFloor:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case ActionCommand.PlayerIfReservedContinuousJump:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case ActionCommand.PlayerIfNotReservedContinuousJump:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case ActionCommand.PlayerIfNotReservedIdleAnimation:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "idleActionNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(6)));
                break;
            case ActionCommand.PlayerStartJump:
                break;
            case ActionCommand.PlayerShootEnemy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "direction", dataView.getUint16(4)));
                break;
            case ActionCommand.PlayerStartKazedama:
                break;
            case ActionCommand.PlayerToAngle:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "direction", dataView.getUint16(4)));
                break;
            case ActionCommand.PlayerStartEffectOfRun:
                break;
            case ActionCommand.EnemyFireBullet:
                break;
            case ActionCommand.SoundEffect:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "range", dataView.getUint16(6)));
                break;
            case ActionCommand.SoundEffect2D:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectNumber", dataView.getUint16(4)));
                break;
            case ActionCommand.StartEffect:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "onGround", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "offX", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "offY", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "offZ", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "scale", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "withoutRotate", dataView.getUint16(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "drawPriority", dataView.getUint16(26)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "roll", dataView.getFloat32(28)));
                break;
            case ActionCommand.StartEffectWithBoneId:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "onGround", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "scale", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "boneNumber", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "withoutRotate", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "drawPriority", dataView.getUint16(16)));
                break;
            case ActionCommand.StartEffectWithBoneName:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "onGround", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "scale", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "boneName", this.getString(dataView, dataView.getUint32(12))));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "withoutRotate", dataView.getUint16(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "drawPriority", dataView.getUint16(18)));
                break;
            case ActionCommand.ShakePlayerCamera:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "power", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "duration", dataView.getFloat32(8)));
                break;
            case ActionCommand.Vibration:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                break;
            case ActionCommand.B00ApplyTranslateFromNode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case ActionCommand.B03Animation:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interpolateTime", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "rAnimationNumber", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "lAnimationNumber", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationType", dataView.getUint16(14)));
                break;
            case ActionCommand.B05FootEffect:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isRightSide", dataView.getUint16(4)));
                break;
            case ActionCommand.B06Animation:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interpolateTime", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "playRate", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "rAnimationNumber", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "lAnimationNumber", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationType", dataView.getUint16(18)));
                break;
        }
    }

    private parseDemoArguments(dataView: DataView) {
        switch (this.demoCommand) {
            case DemoCommand.Start:
                break;
            case DemoCommand.End:
                break;
            case DemoCommand.Loop:
                break;
            case DemoCommand.Pause:
                break;
            case DemoCommand.Jump:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case DemoCommand.Print:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "message", this.getString(dataView, dataView.getUint32(4))));
                break;
            case DemoCommand.Assert:
                break;
            case DemoCommand.ResetFrame:
                break;
            case DemoCommand.EndInit:
                break;
            case DemoCommand.EndViewer:
                break;
            case DemoCommand.EndScene:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "disableClear", dataView.getUint16(4)));
                break;
            case DemoCommand.EndDemo:
                break;
            case DemoCommand.InitAddCharacter:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "id", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationPack", dataView.getUint16(8)));
                break;
            case DemoCommand.InitFieldCharacter:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "id", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationPack", dataView.getUint16(8)));
                break;
            case DemoCommand.InitGimmick:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "id", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationPack", dataView.getUint16(8)));
                break;
            case DemoCommand.InitScene:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "vision", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "field", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "scene", dataView.getUint16(8)));
                break;
            case DemoCommand.InitVoice:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "groupNormal", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "groupPhantomile", dataView.getUint16(6)));
                break;
            case DemoCommand.InitExtendDimmingTimer:
                break;
            case DemoCommand.ChangeScene:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "sceneNumber", dataView.getUint16(4)));
                break;
            case DemoCommand.CreateCharacter:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(6)));
                break;
            case DemoCommand.CharacterColoration:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                break;
            case DemoCommand.DestroyCharacter:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                break;
            case DemoCommand.ShowCharacter:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "visible", dataView.getUint16(6)));
                break;
            case DemoCommand.LandscapePauseNode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "pNodeName", this.getString(dataView, dataView.getUint32(4))));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pause", dataView.getUint16(8)));
                break;
            case DemoCommand.CharacterPauseNode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pause", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "pNodeName", this.getString(dataView, dataView.getUint32(8))));
                break;
            case DemoCommand.Animation:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationNumber", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interpolateTime", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "demoInstance", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "worldAnimation", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loopIn", dataView.getUint16(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loopOut", dataView.getUint16(18)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(24)));
                break;
            case DemoCommand.AnimationByName:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "worldAnimation", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "animationName", this.getString(dataView, dataView.getUint32(8))));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interpolateTime", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loopIn", dataView.getUint16(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loopOut", dataView.getUint16(18)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(24)));
                break;
            case DemoCommand.WaitAnimation:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frame", dataView.getUint16(6)));
                break;
            case DemoCommand.CharacterEye:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "eye", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animation", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "interpolate", dataView.getUint16(10)));
                break;
            case DemoCommand.CharacterMouth:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "mouth", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animation", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "interpolate", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "autoStop", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "stopMouth", dataView.getUint16(14)));
                break;
            case DemoCommand.StopFacial:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                break;
            case DemoCommand.PauseShadow:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pause", dataView.getUint16(6)));
                break;
            case DemoCommand.AnimationScene:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loopIn", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loopOut", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "dummy", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(12)));
                break;
            case DemoCommand.AnimationCamera:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loopIn", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loopOut", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "dummy", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(16)));
                break;
            case DemoCommand.CameraPoint:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "tX", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "tY", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "tZ", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pX", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pY", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pZ", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "twist", dataView.getFloat32(28)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "fov", dataView.getFloat32(32)));
                break;
            case DemoCommand.CameraSavePoint:
                break;
            case DemoCommand.CameraRestorePoint:
                break;
            case DemoCommand.CameraMove:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loop", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "interpolateType", dataView.getUint16(10)));
                break;
            case DemoCommand.CameraRotateLookat:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rX", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rY", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rZ", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loop", dataView.getUint16(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "interpolateType", dataView.getUint16(22)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "divide", dataView.getUint16(24)));
                break;
            case DemoCommand.CameraRotate:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rX", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rY", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rZ", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loop", dataView.getUint16(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "interpolateType", dataView.getUint16(22)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "divide", dataView.getUint16(24)));
                break;
            case DemoCommand.WaitCamera:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frame", dataView.getUint16(4)));
                break;
            case DemoCommand.CameraShake:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "power", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(8)));
                break;
            case DemoCommand.Position:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "flag", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "interpolateType", dataView.getUint16(24)));
                break;
            case DemoCommand.RotationDirect:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "flag", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rX", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rY", dataView.getFloat32(24)));
                break;
            case DemoCommand.Rotation:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "path", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "angle", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "interpolateType", dataView.getUint16(16)));
                break;
            case DemoCommand.Scale:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "flag", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "interpolateType", dataView.getUint16(24)));
                break;
            case DemoCommand.Leap:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "flag", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "interpolateType", dataView.getUint16(28)));
                break;
            case DemoCommand.BindFloor:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "flag", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "update", dataView.getUint16(8)));
                break;
            case DemoCommand.BindCharacter:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "parent", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "bone", this.getString(dataView, dataView.getUint32(8))));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "rotate", dataView.getUint16(12)));
                break;
            case DemoCommand.SpinStart:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "dummy", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "angle", dataView.getFloat32(8)));
                break;
            case DemoCommand.SpinStop:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                break;
            case DemoCommand.PlayEffect:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectNumber", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "demoResource", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rX", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rY", dataView.getFloat32(28)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rZ", dataView.getFloat32(32)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "scale", dataView.getFloat32(36)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "noClear", dataView.getUint16(40)));
                break;
            case DemoCommand.PlayEffectByName:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "effectName", this.getString(dataView, dataView.getUint32(8))));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rX", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rY", dataView.getFloat32(28)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rZ", dataView.getFloat32(32)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "scale", dataView.getFloat32(36)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "noClear", dataView.getUint16(40)));
                break;
            case DemoCommand.PlayEffectBone:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectNumber", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "demoResource", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterInstance", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "follow", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "boneName", this.getString(dataView, dataView.getUint32(16))));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "noClear", dataView.getUint16(20)));
                break;
            case DemoCommand.PlayEffectBoneByName:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "effectName", this.getString(dataView, dataView.getUint32(8))));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterInstance", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "follow", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "boneName", this.getString(dataView, dataView.getUint32(16))));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "noClear", dataView.getUint16(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "translateOnly", dataView.getUint16(22)));
                break;
            case DemoCommand.StopEffect:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                break;
            case DemoCommand.PlayEffectSet:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "effectSetName", this.getString(dataView, dataView.getUint32(4))));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "flag", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterInstance", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "boneName", this.getString(dataView, dataView.getUint32(12))));
                break;
            case DemoCommand.StopEffectSet:
                break;
            case DemoCommand.EnableColorCapture:
                break;
            case DemoCommand.DisableColorCapture:
                break;
            case DemoCommand.EnableLOD:
                break;
            case DemoCommand.DisableLOD:
                break;
            case DemoCommand.EnableSimpleDOF:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "startZ", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startV", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "endV", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(12)));
                break;
            case DemoCommand.DisableSimpleDOF:
                break;
            case DemoCommand.EnableDOF:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "startZ", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "endZ", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startV", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "endV", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "type", dataView.getUint16(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(18)));
                break;
            case DemoCommand.DisableDOF:
                break;
            case DemoCommand.EnableBloom:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bias", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "blend", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(8)));
                break;
            case DemoCommand.DisableBloom:
                break;
            case DemoCommand.EnableClampBloom:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bias", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "blend", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(8)));
                break;
            case DemoCommand.DisableClampBloom:
                break;
            case DemoCommand.EnableFlip:
                break;
            case DemoCommand.DisableFlip:
                break;
            case DemoCommand.ReverseFlip:
                break;
            case DemoCommand.PlaySound:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "volume", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pan", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "surround", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "noClear", dataView.getUint16(20)));
                break;
            case DemoCommand.StopSound:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(6)));
                break;
            case DemoCommand.WaitSound:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                break;
            case DemoCommand.PlayStreamSound:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "track", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "volume", dataView.getFloat32(8)));
                break;
            case DemoCommand.StopStreamSound:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                break;
            case DemoCommand.SoundListener:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterInstance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "follow", dataView.getUint16(6)));
                break;
            case DemoCommand.SoundListenerCamera:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "lookAt", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "follow", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "distance", dataView.getFloat32(8)));
                break;
            case DemoCommand.SoundListenerPosition:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(12)));
                break;
            case DemoCommand.Play3DSound:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterInstance", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "follow", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "range", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "volume", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "disableDoppler", dataView.getUint16(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "noClear", dataView.getUint16(22)));
                break;
            case DemoCommand.Play3DSoundPosition:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "range", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "volume", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "disableDoppler", dataView.getUint16(28)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "noClear", dataView.getUint16(30)));
                break;
            case DemoCommand.SoundSonicSpeed:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(4)));
                break;
            case DemoCommand.ApplyFX:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "channel", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "dummy", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rate", dataView.getFloat32(8)));
                break;
            case DemoCommand.UnapplyFX:
                break;
            case DemoCommand.PlayVoice:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "normalVoice", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "phantomileVoice", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "dummy", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "volume", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pan", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "surround", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "noClear", dataView.getUint16(24)));
                break;
            case DemoCommand.PlayVoice3D:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "normalVoice", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "phantomileVoice", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterInstance", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "follow", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "disableDoppler", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "range", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "volume", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "noClear", dataView.getUint16(24)));
                break;
            case DemoCommand.PlayVoice3DPosition:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "normalVoice", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "phantomileVoice", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "disableDoppler", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "range", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "volume", dataView.getFloat32(28)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "noClear", dataView.getUint16(32)));
                break;
            case DemoCommand.StopVoice:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(6)));
                break;
            case DemoCommand.WaitVoice:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                break;
            case DemoCommand.FadeIn:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(4)));
                break;
            case DemoCommand.FadeOut:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "white", dataView.getUint16(8)));
                break;
            case DemoCommand.WaitFade:
                break;
            case DemoCommand.LogoStart:
                break;
            case DemoCommand.LogoClear:
                break;
            case DemoCommand.WaitLogo:
                break;
            case DemoCommand.MessageOn:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "window", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "x0", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "y0", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "x1", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "y1", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "root", dataView.getUint16(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "style", dataView.getUint16(18)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rootX", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rootY", dataView.getFloat32(24)));
                break;
            case DemoCommand.MessageOff:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "window", dataView.getUint16(4)));
                break;
            case DemoCommand.WaitMessage:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "window", dataView.getUint16(4)));
                break;
            case DemoCommand.MessageMove:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "window", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "x0", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "y0", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "x1", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "y1", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "interpolateType", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(16)));
                break;
            case DemoCommand.MessageSpeed:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "window", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "speed", dataView.getUint16(6)));
                break;
            case DemoCommand.MessageSpeedRate:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "window", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "speed", dataView.getUint16(6)));
                break;
            case DemoCommand.EnableNoneArrowMode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "window", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "flag", dataView.getUint16(6)));
                break;
            case DemoCommand.TutorialStart:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "id", dataView.getUint16(4)));
                break;
            case DemoCommand.TutorialEnd:
                break;
            case DemoCommand.WaitTutorialEnd:
                break;
            case DemoCommand.WaitTutorialDraw:
                break;
            case DemoCommand.OpeningTextStart:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animId", dataView.getUint16(4)));
                break;
            case DemoCommand.WaitOpeningText:
                break;
            case DemoCommand.SendEvent:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "eventNumber", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "param0", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "param1", dataView.getFloat32(12)));
                break;
            case DemoCommand.SendEventById:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterId", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "eventNumber", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "param0", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "param1", dataView.getFloat32(12)));
                break;
            case DemoCommand.ZoomBlur:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "onOff", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(6)));
                break;
            case DemoCommand.ColorTile:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "r", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "g", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "b", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "a", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(12)));
                break;
            case DemoCommand.StartFirework:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "tX", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "tY", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "tZ", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rX", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rY", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rZ", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interval", dataView.getFloat32(28)));
                break;
            case DemoCommand.StopFirework:
                break;
            case DemoCommand.SkipFadeColor:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "white", dataView.getUint16(4)));
                break;
            case DemoCommand.EnableSkipFade:
                break;
            case DemoCommand.DisableSkipFade:
                break;
            case DemoCommand.EnableSkip:
                break;
            case DemoCommand.DisableSkip:
                break;
            case DemoCommand.TimerStart:
                break;
            case DemoCommand.TimerPrint:
                break;
            case DemoCommand.InitBook:
                break;
            case DemoCommand.BookPage:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "page", dataView.getUint16(6)));
                break;
            case DemoCommand.BookName:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                break;
            case DemoCommand.EnablePadCheck:
                break;
            case DemoCommand.DisablePadCheck:
                break;
            case DemoCommand.ResetPadDimmingCount:
                break;
            case DemoCommand.WaitIfKeyOn:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "keyType", dataView.getUint16(4)));
                break;
            case DemoCommand.SetUserValue:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case DemoCommand.JumpIfUserValue:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(8)));
                break;
            case DemoCommand.ResetKlonoaHair:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                break;
            case DemoCommand.SleepKlonoaHair:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "instance", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(6)));
                break;
            case DemoCommand.AddScreenEffect:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "depth", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectID", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "drawPriority", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "rX", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "rY", dataView.getUint16(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "rZ", dataView.getUint16(18)));
                break;

        }
    }

    private parseFieldArguments(dataView: DataView) {
        switch (this.fieldCommand) {
            case FieldCommand.Start:
                break;
            case FieldCommand.End:
                break;
            case FieldCommand.Loop:
                break;
            case FieldCommand.Pause:
                break;
            case FieldCommand.Jump:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.Print:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "message", this.getString(dataView, dataView.getUint32(4))));
                break;
            case FieldCommand.Assert:
                break;
            case FieldCommand.ResetFrame:
                break;
            case FieldCommand.Call:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.JumpToNextLabel:
                break;
            case FieldCommand.LoopTo:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.AddCharacterResource:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(4)));
                break;
            case FieldCommand.DeclareSystem:
                break;
            case FieldCommand.DeclarePortal:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "intoDirection", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "comeOutDirection", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "dstField", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "dstPortal", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "portalMoveEffect", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "onFloor", dataView.getUint16(16)));
                break;
            case FieldCommand.DeclareGimmick:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enableShadow", dataView.getUint16(6)));
                break;
            case FieldCommand.DeclareEnemy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "eclipseCharacterID", dataView.getUint16(6)));
                break;
            case FieldCommand.DeclareEvent:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "collisionRadius", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enableInterference", dataView.getUint16(8)));
                break;
            case FieldCommand.CreateControlPoins:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "num", dataView.getUint16(4)));
                break;
            case FieldCommand.SetControlPoint:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathBindPolicy", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "groundCheckPolicy", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(20)));
                break;
            case FieldCommand.CreateSleepProhibitionPolicies:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "num", dataView.getUint16(4)));
                break;
            case FieldCommand.SetSleepProhibitionPolicy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pathDistanceFrom", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pathDistanceTo", dataView.getFloat32(12)));
                break;
            case FieldCommand.SetResetLabel:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.SetPathNumber:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(4)));
                break;
            case FieldCommand.SetPosition:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point0", dataView.getUint16(4)));
                break;
            case FieldCommand.SetPositionDirect:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(12)));
                break;
            case FieldCommand.SetRotationDirect:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(12)));
                break;
            case FieldCommand.SetRotateSpeed:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(12)));
                break;
            case FieldCommand.Animation:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interpolateTime", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationNumber", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationType", dataView.getUint16(12)));
                break;
            case FieldCommand.AnimationWithoutSameNumber:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interpolateTime", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationNumber", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "animationType", dataView.getUint16(12)));
                break;
            case FieldCommand.WaitAnimation:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "value", dataView.getFloat32(4)));
                break;
            case FieldCommand.UpdateModelRate:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rate", dataView.getFloat32(4)));
                break;
            case FieldCommand.IsTranslucent:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(4)));
                break;
            case FieldCommand.SetPathBindPolicy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "policy", dataView.getUint16(4)));
                break;
            case FieldCommand.SetGroundCheckPolicy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "policy", dataView.getUint16(4)));
                break;
            case FieldCommand.SetLookAtPolicy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "policy", dataView.getUint16(4)));
                break;
            case FieldCommand.SetThroughEnemy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case FieldCommand.UpdateContinuePoint:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "force", dataView.getUint16(4)));
                break;
            case FieldCommand.EnableUpdateShadow:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "object", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "lS", dataView.getUint16(6)));
                break;
            case FieldCommand.SetResistCapture:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(4)));
                break;
            case FieldCommand.EnableWaterSurfaceHeight:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(4)));
                break;
            case FieldCommand.DisableWaterSurfaceHeight:
                break;
            case FieldCommand.ResetPathPoint:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "searchXZ", dataView.getUint16(4)));
                break;
            case FieldCommand.CreateSimpleObjects:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "num", dataView.getUint16(4)));
                break;
            case FieldCommand.AddSimpleItem:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "userID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(22)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "sleepDistance", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectPriority", dataView.getUint16(28)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "shadowStatus", dataView.getUint16(30)));
                break;
            case FieldCommand.AddResidentItem:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "userID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(22)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "zoomRate", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "scaleRate", dataView.getFloat32(28)));
                break;
            case FieldCommand.AddSimpleDropItem:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "userID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frontSpeed", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "powerY", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speedY", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "useShadow", dataView.getUint16(22)));
                break;
            case FieldCommand.AddItemToJump:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "userID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frames", dataView.getUint16(22)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "toX", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "toY", dataView.getFloat32(28)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "toZ", dataView.getFloat32(32)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(36)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "boundSpeed", dataView.getFloat32(40)));
                break;
            case FieldCommand.WaitLastItemCaught:
                break;
            case FieldCommand.AddSimpleEffect:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rX", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rY", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rZ", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "scale", dataView.getFloat32(28)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectID", dataView.getUint16(32)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(34)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "drawPriority", dataView.getUint16(36)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "radius", dataView.getUint16(38)));
                break;
            case FieldCommand.AddScreenEffect:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "depth", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectID", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startFrame", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "drawPriority", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "rX", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "rY", dataView.getUint16(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "rZ", dataView.getUint16(18)));
                break;
            case FieldCommand.DelSimpleEffect:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "killEmitterOnly", dataView.getUint16(6)));
                break;
            case FieldCommand.Activate:
                break;
            case FieldCommand.Inactivate:
                break;
            case FieldCommand.ActivateWithSealMode:
                break;
            case FieldCommand.InactivateEnemySilent:
                break;
            case FieldCommand.EnableObjectCollision:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(4)));
                break;
            case FieldCommand.SetObjectCollisionSphere:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "radius", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "offsetToCenterX", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "offsetToCenterY", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "offsetToCenterZ", dataView.getFloat32(16)));
                break;
            case FieldCommand.SetObjectCollisionSegment:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "radius", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "v0x", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "v0y", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "v0z", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "v1x", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "v1y", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "v1z", dataView.getFloat32(28)));
                break;
            case FieldCommand.AllowSleep:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bool", dataView.getUint16(4)));
                break;
            case FieldCommand.SleepDistance:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "distance", dataView.getFloat32(4)));
                break;
            case FieldCommand.WaitDistanceFromPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "distance", dataView.getFloat32(4)));
                break;
            case FieldCommand.WaitDistanceFromPlayerXZ:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "distance", dataView.getFloat32(4)));
                break;
            case FieldCommand.JumpIfPlayerComeToPath:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(6)));
                break;
            case FieldCommand.WaitPlayerComeToPath:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(4)));
                break;
            case FieldCommand.WaitHitToPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "withCapturingTarget", dataView.getUint16(4)));
                break;
            case FieldCommand.WaitNoHitToPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "withCapturingTarget", dataView.getUint16(4)));
                break;
            case FieldCommand.WaitHitToThrownEnemy:
                break;
            case FieldCommand.WaitNoHitToThrownEnemy:
                break;
            case FieldCommand.WaitPlayerOnGround:
                break;
            case FieldCommand.JumpIfDistanceFromPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "distance", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(10)));
                break;
            case FieldCommand.WaitIfDistanceFromPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "distance", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(8)));
                break;
            case FieldCommand.JumpIfPathFromPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "diff", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(10)));
                break;
            case FieldCommand.WaitIfPathFromPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "diff", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(8)));
                break;
            case FieldCommand.JumpIfDetailPathFromPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pathRate", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(12)));
                break;
            case FieldCommand.WaitIfDetailPathFromPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pathRate", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(10)));
                break;
            case FieldCommand.WaitIfDetailPathFromEnemy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pathRate", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(10)));
                break;
            case FieldCommand.WaitIfPlayerInsideOfPath:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pathRate0", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pathRate1", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(12)));
                break;
            case FieldCommand.JumpIfPlayerInsideOfPath:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pathRate0", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pathRate1", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(14)));
                break;
            case FieldCommand.WaitIfPlayerOutsideOfPath:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pathRate0", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pathRate1", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(12)));
                break;
            case FieldCommand.JumpIfPlayerOutsideOfPath:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pathRate0", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pathRate1", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(14)));
                break;
            case FieldCommand.JumpIfDestroyEnemy:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enemyLabel", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "active", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(8)));
                break;
            case FieldCommand.PlaySEInArea:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "playRange", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "stopRange", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(12)));
                break;
            case FieldCommand.JumpIfFrameCounter:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(10)));
                break;
            case FieldCommand.WaitIfFrameCounter:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(8)));
                break;
            case FieldCommand.JumpIfCharacterID:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(8)));
                break;
            case FieldCommand.WaitInactivation:
                break;
            case FieldCommand.JumpIfKnockOutCount:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "count", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(8)));
                break;
            case FieldCommand.WaitIfKnockOutCount:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "count", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(6)));
                break;
            case FieldCommand.JumpIfPathOn:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "diff", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(10)));
                break;
            case FieldCommand.WaitIfPathOn:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "diff", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(8)));
                break;
            case FieldCommand.JumpIfAction:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "actionNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(8)));
                break;
            case FieldCommand.WaitIfAction:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "actionNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(6)));
                break;
            case FieldCommand.JumpIfEnemyStatus:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enemyStatusNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(8)));
                break;
            case FieldCommand.WaitIfEnemyStatus:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enemyStatusNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(6)));
                break;
            case FieldCommand.JumpIfPathDistanceFromPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "distance1", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "distance2", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(14)));
                break;
            case FieldCommand.WaitBinded:
                break;
            case FieldCommand.WaitRotateAction:
                break;
            case FieldCommand.WaitJumpAction:
                break;
            case FieldCommand.WaitJumpActionInActive:
                break;
            case FieldCommand.WaitJumpActionExceptLand:
                break;
            case FieldCommand.WaitPathAction:
                break;
            case FieldCommand.WaitMove:
                break;
            case FieldCommand.WaitIfIdleAction:
                break;
            case FieldCommand.BindObject:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "targetLabel", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "sync", dataView.getUint16(6)));
                break;
            case FieldCommand.ReleaseBindObject:
                break;
            case FieldCommand.TargetToDesappear:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "targetLabel", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "status", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "silent", dataView.getUint16(8)));
                break;
            case FieldCommand.SetVariableU16:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                break;
            case FieldCommand.AddVariableU16:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                break;
            case FieldCommand.JumpIfVariableU16:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(10)));
                break;
            case FieldCommand.WaitIfVariableU16:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(8)));
                break;
            case FieldCommand.SetVariableU16SelfLabel:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(4)));
                break;
            case FieldCommand.SetVariableGlobal:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                break;
            case FieldCommand.AddVariableGlobal:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                break;
            case FieldCommand.JumpIfVariableGlobal:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(10)));
                break;
            case FieldCommand.WaitIfVariableGlobal:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(8)));
                break;
            case FieldCommand.SetVariableGlobalSelfLabel:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(4)));
                break;
            case FieldCommand.JumpIfCurrentPortal:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "portalNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(8)));
                break;
            case FieldCommand.WaitIfCurrentPortal:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "portalNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(6)));
                break;
            case FieldCommand.JumpIfRescued:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "peopleNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(6)));
                break;
            case FieldCommand.Idle:
                break;
            case FieldCommand.Rotation:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "direction", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isFreeAngle", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speedRate", dataView.getFloat32(8)));
                break;
            case FieldCommand.RotationX:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "angle", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(8)));
                break;
            case FieldCommand.RotationY:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "angle", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(8)));
                break;
            case FieldCommand.RotationZ:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "angle", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(8)));
                break;
            case FieldCommand.GimmickEnableEndOfDemoYaw:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.GimmickEnableDomoCast:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.EnableColoration:
                break;
            case FieldCommand.Alpha:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "alpha", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(8)));
                break;
            case FieldCommand.LookAtPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speedRate", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "behind", dataView.getUint16(8)));
                break;
            case FieldCommand.LookAtObject:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speedRate", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "behind", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "targetLabel", dataView.getUint16(10)));
                break;
            case FieldCommand.Prowl:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point0", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "direction", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "reserved", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "complement", dataView.getUint16(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "followPath", dataView.getUint16(18)));
                break;
            case FieldCommand.Move:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point0", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "forword", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "firstSpeed", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "minimumSpeed", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "maxSpeed", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "fricCoeff", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "slope", dataView.getUint16(28)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "hitWall", dataView.getUint16(30)));
                break;
            case FieldCommand.Circle:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "type", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "offset", dataView.getFloat32(12)));
                break;
            case FieldCommand.Revolve:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "reserved", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(8)));
                break;
            case FieldCommand.JumpAction:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speedRate", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "jumpPower", dataView.getFloat32(8)));
                break;
            case FieldCommand.PathLinear:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frames", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "followPath", dataView.getUint16(8)));
                break;
            case FieldCommand.GimmickPathLinear:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frames", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "followPath", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "groundCheckPolicy", dataView.getUint16(10)));
                break;
            case FieldCommand.PathBSpline:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point2", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frames", dataView.getUint16(8)));
                break;
            case FieldCommand.PathBSplineJ:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point2", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frames", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(8)));
                break;
            case FieldCommand.PathBSplineJPoint:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point2", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frames", dataView.getUint16(8)));
                break;
            case FieldCommand.StartBullet:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point0", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frame", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "num", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathBindPolicy", dataView.getUint16(16)));
                break;
            case FieldCommand.StartBulletParabola:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point0", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frame", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "num", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "upSpeed", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "dmy", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathBindPolicy", dataView.getUint16(24)));
                break;
            case FieldCommand.E00SetLookAround:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enalbe", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "eyes", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interval", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "turn", dataView.getUint16(12)));
                break;
            case FieldCommand.E00ManualPlayMotion:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interpolate", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "index", dataView.getUint16(8)));
                break;
            case FieldCommand.E00HipSlide:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point0", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "forword", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "firstSpeed", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "minimumSpeed", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "maxSpeed", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "fricCoeff", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "slope", dataView.getUint16(28)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "hitWall", dataView.getUint16(30)));
                break;
            case FieldCommand.E00WaitHipSlide:
                break;
            case FieldCommand.E00HomingPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "serchInterval", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "serchRange", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "turnInterval", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(16)));
                break;
            case FieldCommand.E00JokerStage:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.E00BindLeef:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.E00ToRideLeefAction:
                break;
            case FieldCommand.E00ToEndRideLeefAction:
                break;
            case FieldCommand.E00WaitEndRideLeefAction:
                break;
            case FieldCommand.E00ToRidePoleAction:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(12)));
                break;
            case FieldCommand.E00WaitEndRidePoleAction:
                break;
            case FieldCommand.E00AddWallCollision:
                break;
            case FieldCommand.E02EnableNockbackToFall:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point0", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "fallLimitHeight", dataView.getUint16(10)));
                break;
            case FieldCommand.E02FollowPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point0", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "jumpHeight", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "jumpInterval", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "forward", dataView.getUint16(20)));
                break;
            case FieldCommand.E04EnableNockbackToFall:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point0", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "fallLimitHeight", dataView.getUint16(10)));
                break;
            case FieldCommand.E05WaitIfArmorBreak:
                break;
            case FieldCommand.E05JumpIfArmorBreak:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.E07WaitIfArmorBreak:
                break;
            case FieldCommand.E07JumpIfArmorBreak:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.E09ToSpecifiedbe11:
                break;
            case FieldCommand.E09ToSpecifiedbe11Param:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "jumpDistance", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "jumpHeight", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frames", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "forward", dataView.getUint16(16)));
                break;
            case FieldCommand.E09ToSpecifiedbe12:
                break;
            case FieldCommand.E09ToSpecifiedbe12Param:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "addSpeed", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "maxSpeed", dataView.getFloat32(8)));
                break;
            case FieldCommand.E09ReinforcedJumpDescent:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "reinforcedHeight", dataView.getFloat32(4)));
                break;
            case FieldCommand.E09ToSpecifiedbe13:
                break;
            case FieldCommand.E10ToSpecifiedbe13Param:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "jumpDistance", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "jumpHeight", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frames", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "forward", dataView.getUint16(20)));
                break;
            case FieldCommand.E11SetLandPointNum:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "num", dataView.getUint16(4)));
                break;
            case FieldCommand.E11HiJumpHeight:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "height", dataView.getUint16(4)));
                break;
            case FieldCommand.E11HiJumpRange:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "range", dataView.getUint16(4)));
                break;
            case FieldCommand.E12OnlyIdleMotion:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case FieldCommand.E12AutoFloatFly:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "maxHeight", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(12)));
                break;
            case FieldCommand.E12SERange:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "range", dataView.getFloat32(4)));
                break;
            case FieldCommand.E12IdleMotionIsRest:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.E17ShakeCamera:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case FieldCommand.E17RotSpeed:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(4)));
                break;
            case FieldCommand.E17WaitFallLimt:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(4)));
                break;
            case FieldCommand.E17EnableJumpBound:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "enable", dataView.getFloat32(4)));
                break;
            case FieldCommand.E17SpecialB01:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "turnPoint", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "aimPoint", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "turnRange", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "curveRate", dataView.getFloat32(12)));
                break;
            case FieldCommand.E17NonBoundLand:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.E19Appear:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "groundUnder", dataView.getUint16(4)));
                break;
            case FieldCommand.E19WaitReadyAttack:
                break;
            case FieldCommand.E20AttackInterval:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                break;
            case FieldCommand.E20TurnParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "turn", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "brake", dataView.getFloat32(8)));
                break;
            case FieldCommand.E20AttackRate:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rate", dataView.getFloat32(4)));
                break;
            case FieldCommand.E21SomersaultSpeed:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "inSpeed", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "outSpeed", dataView.getFloat32(8)));
                break;
            case FieldCommand.E25TurnIdleFrame:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                break;
            case FieldCommand.E27ExplosionLimit:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(4)));
                break;
            case FieldCommand.E27InActivate:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "silent", dataView.getUint16(4)));
                break;
            case FieldCommand.E27EnableActiveFall:
                break;
            case FieldCommand.E28Fluctuate:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "hDistance", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "vDistance", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "hCycle", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "vCycle", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(16)));
                break;
            case FieldCommand.E29ActionParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interval", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "range", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "prowlTurn", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "lookForce", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "turnDistance", dataView.getFloat32(16)));
                break;
            case FieldCommand.E30AppearTime:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(4)));
                break;
            case FieldCommand.E30MoveSpeed:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "moveSpeed", dataView.getFloat32(4)));
                break;
            case FieldCommand.E30WaitVanish:
                break;
            case FieldCommand.E31AttackParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interval", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "miniRange", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "maxRange", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "miniSpeed", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "maxSpeed", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "maxRangeTime", dataView.getFloat32(24)));
                break;
            case FieldCommand.E33AttackSwingAngle:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "max", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "minimum", dataView.getFloat32(8)));
                break;
            case FieldCommand.E33NonAttackProwlRate:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rate", dataView.getFloat32(4)));
                break;
            case FieldCommand.E33ChainMaxRange:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "length", dataView.getFloat32(4)));
                break;
            case FieldCommand.E35EnableAttackInIdle:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.E35AttackPostureRange:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "xZ", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(8)));
                break;
            case FieldCommand.E35AttackSpeedRate:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rate", dataView.getFloat32(4)));
                break;
            case FieldCommand.E33EnableForceStopAttack:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.E33WaitEndAttack:
                break;
            case FieldCommand.E35SetBalloonLifeTime:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                break;
            case FieldCommand.E37SetLandPointNum:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "num", dataView.getUint16(4)));
                break;
            case FieldCommand.E37EnableManualLandPoint:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.E37SetLandPoint:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(12)));
                break;
            case FieldCommand.E37ProwlEndEdge:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case FieldCommand.E37Fall:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "stepWidth", dataView.getFloat32(4)));
                break;
            case FieldCommand.E37FallParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "firstG", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "xZRate", dataView.getFloat32(8)));
                break;
            case FieldCommand.E37FollowPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case FieldCommand.E39ChangeAttackMode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "mode", dataView.getUint16(4)));
                break;
            case FieldCommand.E39AttackRangeAngle:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "angle", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "randomAttack", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "range", dataView.getUint16(8)));
                break;
            case FieldCommand.E39ChangeAttackModeByPath:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "mode", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "path", dataView.getUint16(6)));
                break;
            case FieldCommand.E39AutoJump:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point0", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frames", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "interval", dataView.getFloat32(16)));
                break;
            case FieldCommand.E39NearBulletParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "lifeTime", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "upSpeed", dataView.getFloat32(12)));
                break;
            case FieldCommand.E40SetGuardInterval:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                break;
            case FieldCommand.E40SetJumpHeight:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(4)));
                break;
            case FieldCommand.E40WaitCarelessAction:
                break;
            case FieldCommand.E40DontMoveProwl:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case FieldCommand.E41DefaultAngle:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "angle", dataView.getFloat32(4)));
                break;
            case FieldCommand.E41SetParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "maxSlope", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "ivyScale", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "turnRate", dataView.getFloat32(16)));
                break;
            case FieldCommand.E42AttackParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "range", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "direction", dataView.getUint16(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "followPath", dataView.getUint16(18)));
                break;
            case FieldCommand.StartBossCamera:
                break;
            case FieldCommand.B00EnableApplyTranslateFromNode:
                break;
            case FieldCommand.B04ResetHeart:
                break;
            case FieldCommand.B06Replace:
                break;
            case FieldCommand.G00WaitSwitchStatus:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case FieldCommand.G00Reset:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "roll", dataView.getUint16(4)));
                break;
            case FieldCommand.G00AlreadyON:
                break;
            case FieldCommand.G00AlreadyONUnlock:
                break;
            case FieldCommand.G00HitToChangeStatusAlways:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.G00UseMissSE:
                break;
            case FieldCommand.G04WaitFall:
                break;
            case FieldCommand.G04AlreadyFall:
                break;
            case FieldCommand.G03BreakFrame:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "index", dataView.getUint16(8)));
                break;
            case FieldCommand.G03StartMove:
                break;
            case FieldCommand.G03WaitStop:
                break;
            case FieldCommand.G03FlyCartFrame:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                break;
            case FieldCommand.G03PlayerSeparateFrame:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                break;
            case FieldCommand.G03DestroyedExplosion:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                break;
            case FieldCommand.G03SmallExplosion:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(12)));
                break;
            case FieldCommand.G03WaitCameraFrame:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                break;
            case FieldCommand.G05SetAmplitude:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "amplitude", dataView.getFloat32(4)));
                break;
            case FieldCommand.G05SetFactor:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "factor", dataView.getFloat32(4)));
                break;
            case FieldCommand.G06SetFlyMoveParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "width", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "slope", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "num", dataView.getUint16(20)));
                break;
            case FieldCommand.G08Start:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "timeStay", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "timeShake", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "timeStore", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "timeRise", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "timeBoilOut", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "timeFall", dataView.getFloat32(28)));
                break;
            case FieldCommand.G11Param:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "scale", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "rideable", dataView.getUint16(8)));
                break;
            case FieldCommand.G11GlowUp:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(4)));
                break;
            case FieldCommand.G11FromDemo:
                break;
            case FieldCommand.G12RopeHangPoint:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point", dataView.getUint16(4)));
                break;
            case FieldCommand.G12WaitRidePlayer:
                break;
            case FieldCommand.G12SetSlope:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "minSlope", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "maxSlope", dataView.getFloat32(8)));
                break;
            case FieldCommand.G12EnableGetOff:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.G12HoldHangPoint:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.G12CSetOwner:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "targetLabel", dataView.getUint16(4)));
                break;
            case FieldCommand.G12CRollParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rotSpeed", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "checkMoveXZ", dataView.getUint16(8)));
                break;
            case FieldCommand.G13WaitRidePlayer:
                break;
            case FieldCommand.G13WaitMove:
                break;
            case FieldCommand.G13HardBindPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.G15SetPower:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "manualJumpPower", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "autoJumpPower", dataView.getFloat32(8)));
                break;
            case FieldCommand.G16ToFall:
                break;
            case FieldCommand.G17AlreadyBloom:
                break;
            case FieldCommand.G17WaitBloom:
                break;
            case FieldCommand.G18AlreadyStop:
                break;
            case FieldCommand.G18WaitRidePlayer:
                break;
            case FieldCommand.G18MoveStart:
                break;
            case FieldCommand.G18WaitFinish:
                break;
            case FieldCommand.G18WaitFrame:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                break;
            case FieldCommand.G21SetStopFrame:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "index", dataView.getUint16(8)));
                break;
            case FieldCommand.G21SetAdjustCameraOffset:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "index", dataView.getUint16(16)));
                break;
            case FieldCommand.G21SetStartPoint:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "index", dataView.getUint16(4)));
                break;
            case FieldCommand.G21Activate:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "active", dataView.getUint16(4)));
                break;
            case FieldCommand.G21FirstPower:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "firstSpeedRate", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "downSpeedRate", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "index", dataView.getUint16(12)));
                break;
            case FieldCommand.G21TurnOnThePower:
                break;
            case FieldCommand.G21WaitFinishTurnOnThePower:
                break;
            case FieldCommand.G21SetFinishTurnOnThePower:
                break;
            case FieldCommand.G24StartOpen:
                break;
            case FieldCommand.G24BToOpen:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "already", dataView.getUint16(4)));
                break;
            case FieldCommand.G27DoExec:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case FieldCommand.G28BindPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bind", dataView.getUint16(4)));
                break;
            case FieldCommand.G29InactivateWings:
                break;
            case FieldCommand.G30LeefAngle:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "angleZ", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "angleY", dataView.getFloat32(8)));
                break;
            case FieldCommand.G31SetFallTime:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "timeLimit", dataView.getFloat32(4)));
                break;
            case FieldCommand.G32SetHangPoint:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point0", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "postRate", dataView.getFloat32(8)));
                break;
            case FieldCommand.G32SetParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rideFrame", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "width", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(12)));
                break;
            case FieldCommand.G33SetParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "hangHeight", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "maxSlope", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "slopeFrame", dataView.getFloat32(12)));
                break;
            case FieldCommand.G33BackRopeColorRate:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rate", dataView.getFloat32(4)));
                break;
            case FieldCommand.G34ToBreak:
                break;
            case FieldCommand.G34MakeKey:
                break;
            case FieldCommand.G34JumpIfValidKey:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.G34PathBSpline:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point2", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frames", dataView.getUint16(8)));
                break;
            case FieldCommand.G36RideTime:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(4)));
                break;
            case FieldCommand.G43WaitRidePlayer:
                break;
            case FieldCommand.G43PathLinear:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frames", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "followPath", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "groundCheckPolicy", dataView.getUint16(10)));
                break;
            case FieldCommand.G44WaitRidePlayer:
                break;
            case FieldCommand.G44PathLinear:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frames", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "followPath", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "groundCheckPolicy", dataView.getUint16(10)));
                break;
            case FieldCommand.G45StartRemove:
                break;
            case FieldCommand.G46OpenBarricase:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "index", dataView.getUint16(4)));
                break;
            case FieldCommand.G46LimitPos:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "limit", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "index", dataView.getUint16(8)));
                break;
            case FieldCommand.G46AlreadyOpen:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "index", dataView.getUint16(4)));
                break;
            case FieldCommand.G49WaitRidePlayer:
                break;
            case FieldCommand.G49NoDummyPathMode:
                break;
            case FieldCommand.G49Setv524Mode:
                break;
            case FieldCommand.G49v524PathLinear:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frames", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "followPath", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "groundCheckPolicy", dataView.getUint16(10)));
                break;
            case FieldCommand.G50SetLimitDistance:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "distance", dataView.getFloat32(4)));
                break;
            case FieldCommand.G50SetTime:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                break;
            case FieldCommand.G50StartOn:
                break;
            case FieldCommand.G50StartOff:
                break;
            case FieldCommand.G50StatusOn:
                break;
            case FieldCommand.G51Open:
                break;
            case FieldCommand.G53SetColor:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "color", dataView.getUint16(4)));
                break;
            case FieldCommand.G53WaitBroken:
                break;
            case FieldCommand.G54SetColor:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "color", dataView.getUint16(4)));
                break;
            case FieldCommand.G54StartOpen:
                break;
            case FieldCommand.G54Opened:
                break;
            case FieldCommand.G55SetColor:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "color", dataView.getUint16(4)));
                break;
            case FieldCommand.G55StartOpen:
                break;
            case FieldCommand.G55Opened:
                break;
            case FieldCommand.G56WaitRidePlayer:
                break;
            case FieldCommand.G56PathLinear:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "point1", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frames", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "followPath", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "groundCheckPolicy", dataView.getUint16(10)));
                break;
            case FieldCommand.G56SetActionMode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "mode", dataView.getUint16(4)));
                break;
            case FieldCommand.G56ReleaseDummyPath:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(4)));
                break;
            case FieldCommand.G56SetV621CameraMode:
                break;
            case FieldCommand.G57SetParameter:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "vanishTimeLimit", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "vanishingTimeLimit", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "cycleRotateXTime", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "cycleRotateYTime", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "waveringRotateLimit", dataView.getFloat32(20)));
                break;
            case FieldCommand.G58SetParameter:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "vanishTimeLimit", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "vanishingTimeLimit", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "cycleRotateXTime", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "waveringRotateLimit", dataView.getFloat32(16)));
                break;
            case FieldCommand.G59BindPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.G59WaitRidePlayer:
                break;
            case FieldCommand.G64Param:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "width", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frame", dataView.getFloat32(8)));
                break;
            case FieldCommand.G64Open:
                break;
            case FieldCommand.G64AlreadyOpen:
                break;
            case FieldCommand.G68SetTime:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(4)));
                break;
            case FieldCommand.G68StartMove:
                break;
            case FieldCommand.G68Moved:
                break;
            case FieldCommand.G78Visible:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case FieldCommand.G78WaitDestroy:
                break;
            case FieldCommand.G78WaitDestroyAndAddItem:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "userID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "toCatch", dataView.getUint16(10)));
                break;
            case FieldCommand.G78WaitDestroyAndAddResidentItem:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "userID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "toCatch", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "zoomRate", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "scaleRate", dataView.getFloat32(16)));
                break;
            case FieldCommand.G78WaitDestroyAndAddDropItem:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "userID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frontSpeed", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "powerY", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speedY", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "useShadow", dataView.getUint16(22)));
                break;
            case FieldCommand.G78WaitDestroyAndAddItemToJump:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "userID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frames", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "toX", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "toY", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "toZ", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "boundSpeed", dataView.getFloat32(28)));
                break;
            case FieldCommand.G78MakeKey:
                break;
            case FieldCommand.G78JumpIfValidKey:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.G87PowerUp:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frames", dataView.getFloat32(4)));
                break;
            case FieldCommand.G87PowerDown:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "frames", dataView.getFloat32(4)));
                break;
            case FieldCommand.G87SetParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "power", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "downPower", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "limitPower", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "maximumHeight", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "influenceHeight", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "influenceRadius", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "boost", dataView.getUint16(28)));
                break;
            case FieldCommand.G87PriorityHigh:
                break;
            case FieldCommand.G89SetParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "power", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "downPower", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "limitPower", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "maximumHeight", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "influenceHeight", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "influenceRadius", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "boost", dataView.getUint16(28)));
                break;
            case FieldCommand.G89Distance:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "distance", dataView.getFloat32(4)));
                break;
            case FieldCommand.G89EffectOffsetY:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "offsetY", dataView.getFloat32(4)));
                break;
            case FieldCommand.Gb1SetBurnoutTime:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(4)));
                break;
            case FieldCommand.Gb1SetLowBurningTime:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(4)));
                break;
            case FieldCommand.Gb1SetHighBurningTime:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(4)));
                break;
            case FieldCommand.Gb1SetBlazeHeightLevel:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "lowHeight", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "highHeight", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "level", dataView.getUint16(12)));
                break;
            case FieldCommand.GbaSetCloseSpeed:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(4)));
                break;
            case FieldCommand.GbaStartClose:
                break;
            case FieldCommand.GbcRideableParam:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "width", dataView.getFloat32(8)));
                break;
            case FieldCommand.GbcDisableRaideablePlayerPath:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(4)));
                break;
            case FieldCommand.AddItemI12:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(18)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "recX", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "recY", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "recZ", dataView.getFloat32(28)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "recDirection", dataView.getUint16(32)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "sleepDistance", dataView.getUint16(34)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "checkPathMin", dataView.getUint16(36)));
                break;
            case FieldCommand.I13AddSimpleItemWithSetSpeed:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "userID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isTranslucent", dataView.getUint16(22)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "speed", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "range", dataView.getFloat32(28)));
                break;
            case FieldCommand.AddItemGoldenMedal:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "userID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "characterID", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(20)));
                break;
            case FieldCommand.J03Open:
                break;
            case FieldCommand.J03Close:
                break;
            case FieldCommand.J03AlreadyOpend:
                break;
            case FieldCommand.J04OpenDown:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                break;
            case FieldCommand.AddWormHole:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "suckingForce", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(16)));
                break;
            case FieldCommand.P00ReleaseAttachingModel:
                break;
            case FieldCommand.ShakePlayerCamera:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "power", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "duration", dataView.getFloat32(8)));
                break;
            case FieldCommand.SetPortalMoveLength:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "length", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(6)));
                break;
            case FieldCommand.SetPortalEnterTypeTouch:
                break;
            case FieldCommand.ApplyFX:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "channel", dataView.getUint16(4)));
                break;
            case FieldCommand.UnapplyFX:
                break;
            case FieldCommand.StartStream:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "number", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "channel", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "track", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "trackFadeTime", dataView.getUint16(10)));
                break;
            case FieldCommand.SetStreamVolume:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "volume", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "channel", dataView.getUint16(8)));
                break;
            case FieldCommand.StopStream:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "channel", dataView.getUint16(4)));
                break;
            case FieldCommand.FadeInStream:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "channel", dataView.getUint16(6)));
                break;
            case FieldCommand.FadeOutStream:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "channel", dataView.getUint16(6)));
                break;
            case FieldCommand.PauseStream:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "channel", dataView.getUint16(6)));
                break;
            case FieldCommand.UnPauseStream:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "channel", dataView.getUint16(6)));
                break;
            case FieldCommand.SoundEffect:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectNumber", dataView.getUint16(4)));
                break;
            case FieldCommand.SoundEffect3D:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "effectNumber", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "range", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pX", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pY", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pZ", dataView.getFloat32(16)));
                break;
            case FieldCommand.BlackFadeIn:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                break;
            case FieldCommand.WhiteFadeIn:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                break;
            case FieldCommand.BlackFadeOut:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                break;
            case FieldCommand.WhiteFadeOut:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                break;
            case FieldCommand.WaitFade:
                break;
            case FieldCommand.ColorTile:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "r", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "g", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "b", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "a", dataView.getUint16(12)));
                break;
            case FieldCommand.BlurTile:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "r", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "g", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "b", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "a", dataView.getUint16(12)));
                break;
            case FieldCommand.ZoomTile:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "r", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "g", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "b", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "a", dataView.getUint16(12)));
                break;
            case FieldCommand.EnableColorCapture:
                break;
            case FieldCommand.DisableColorCapture:
                break;
            case FieldCommand.EnableLOD:
                break;
            case FieldCommand.DisableLOD:
                break;
            case FieldCommand.EnableSimpleDOF:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "startZ", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startV", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "endV", dataView.getUint16(10)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(12)));
                break;
            case FieldCommand.DisableSimpleDOF:
                break;
            case FieldCommand.EnableDOF:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "startZ", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "endZ", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "startV", dataView.getUint16(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "endV", dataView.getUint16(14)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "type", dataView.getUint16(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(18)));
                break;
            case FieldCommand.DisableDOF:
                break;
            case FieldCommand.EnableBloom:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bias", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "blend", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(8)));
                break;
            case FieldCommand.DisableBloom:
                break;
            case FieldCommand.EnableClampBloom:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "bias", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "blend", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "time", dataView.getUint16(8)));
                break;
            case FieldCommand.DisableClampBloom:
                break;
            case FieldCommand.PreLoadField:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "fieldNumber", dataView.getUint16(4)));
                break;
            case FieldCommand.PreLoadDemo:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "demoNumber", dataView.getUint16(4)));
                break;
            case FieldCommand.AreaJump:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "dstField", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "dstPortal", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "portalMoveEffect", dataView.getUint16(8)));
                break;
            case FieldCommand.PortalModelPosture:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rotateY", dataView.getFloat32(16)));
                break;
            case FieldCommand.PortalDoNotJump:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.StartDemo:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "eventID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "waitPlayerStand", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "surely", dataView.getUint16(8)));
                break;
            case FieldCommand.WaitDemo:
                break;
            case FieldCommand.JumpIfDemoCleared:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "eventID", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(6)));
                break;
            case FieldCommand.StartStageTitle:
                break;
            case FieldCommand.WaitStageTitle:
                break;
            case FieldCommand.StartStageClear:
                break;
            case FieldCommand.WaitStageClear:
                break;
            case FieldCommand.EndOfStage:
                break;
            case FieldCommand.JumpIfCountOfDramePieces:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "num", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(8)));
                break;
            case FieldCommand.JumpIfInTimeAttack:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.JumpIfFieldFlipping:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.JumpIfNotFieldFlipping:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.JumpIfNewComer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.WaitIfKeyOn:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "keyType", dataView.getUint16(4)));
                break;
            case FieldCommand.JumpIfKeyOn:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "keyType", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(6)));
                break;
            case FieldCommand.WaitIfForbidOperation:
                break;
            case FieldCommand.JumpIfForbidOperation:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(4)));
                break;
            case FieldCommand.ReservePlayerIdleAction:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "idleActionNumber", dataView.getUint16(4)));
                break;
            case FieldCommand.SetEclipseMode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enable", dataView.getUint16(4)));
                break;
            case FieldCommand.WaitIfEclipseMode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(6)));
                break;
            case FieldCommand.JumpIfEclipseMode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "value", dataView.getUint16(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "compareType", dataView.getUint16(6)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "label", dataView.getUint16(8)));
                break;
            case FieldCommand.DeclareBossStage:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "enabled", dataView.getUint16(4)));
                break;
            case FieldCommand.StartManualDemo:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "sleepPlayer", dataView.getUint16(4)));
                break;
            case FieldCommand.EndManualDemo:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "unsleepPlayer", dataView.getUint16(4)));
                break;
            case FieldCommand.DeclareTimeAttackForExtra2:
                break;
            case FieldCommand.StartTimeAttackRecord:
                break;
            case FieldCommand.StopTimeAttackRecord:
                break;
            case FieldCommand.VisibleLandscapeNode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "nodeName", this.getString(dataView, dataView.getUint32(4))));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "recursive", dataView.getUint16(8)));
                break;
            case FieldCommand.VisibleLandscapeNodeAll:
                break;
            case FieldCommand.InvisibleLandscapeNode:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.string, "nodeName", this.getString(dataView, dataView.getUint32(4))));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "recursive", dataView.getUint16(8)));
                break;
            case FieldCommand.InvisibleLandscapeNodeAll:
                break;
            case FieldCommand.StartManualCamera:
                break;
            case FieldCommand.EndManualCamera:
                break;
            case FieldCommand.CameraPoint:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "tX", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "tY", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "tZ", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pX", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pY", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pZ", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "twist", dataView.getFloat32(28)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "fov", dataView.getFloat32(32)));
                break;
            case FieldCommand.CameraPointRoot:
                break;
            case FieldCommand.CameraMove:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loop", dataView.getUint16(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "interpolateType", dataView.getUint16(10)));
                break;
            case FieldCommand.CameraRotateLookat:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rX", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rY", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rZ", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loop", dataView.getUint16(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "interpolateType", dataView.getUint16(22)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "divide", dataView.getUint16(24)));
                break;
            case FieldCommand.CameraRotate:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rX", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rY", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "rZ", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "time", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "loop", dataView.getUint16(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "interpolateType", dataView.getUint16(22)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "divide", dataView.getUint16(24)));
                break;
            case FieldCommand.WaitCamera:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "frame", dataView.getUint16(4)));
                break;
            case FieldCommand.SetFieldCamera:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "tX", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "tY", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "tZ", dataView.getFloat32(12)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pX", dataView.getFloat32(16)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pY", dataView.getFloat32(20)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "pZ", dataView.getFloat32(24)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "twist", dataView.getFloat32(28)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "fov", dataView.getFloat32(32)));
                break;
            case FieldCommand.GuidepostVisible:
                break;
            case FieldCommand.GuidepostInvisible:
                break;
            case FieldCommand.GuidepostRotationZ:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "angleZ", dataView.getFloat32(4)));
                break;
            case FieldCommand.GuidepostPosition:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "x", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "y", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "z", dataView.getFloat32(12)));
                break;
            case FieldCommand.SetPathNumberOfPlayer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "pathNumber", dataView.getUint16(4)));
                break;
            case FieldCommand.StartDebugTimer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "reset", dataView.getUint16(4)));
                break;
            case FieldCommand.StopDebugTimer:
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "height", dataView.getFloat32(4)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.float, "deadFallHeight", dataView.getFloat32(8)));
                this._arguments.push(new BScriptCommandArgument(ArgumentType.uint16, "isEnableCollisionBGWall", dataView.getUint16(12)));
                break;
        }
    }
}

export class BScriptCommandArgument {
    private _type: ArgumentType;
    public name: string;
    private _value: number | string;

    constructor(type: ArgumentType, name: string, value: any) {
        this._type = type;
        this.name = name;
        this._value = value;
    }

    public get type() {
        return this._type;
    }

    public get value() {
        return this._value;
    }

    public set value(value: any) {
        if ((this._type == ArgumentType.uint16 || this._type == ArgumentType.float) && typeof value === "string") {
            value = this._type == ArgumentType.uint16 ? parseInt(value) : parseFloat(value);
            if (isNaN(value))
                throw "Invalid number"
        }
        if ((this._type == ArgumentType.uint16 || this._type == ArgumentType.float) && typeof value !== "number")
            throw "Value must be a number";
        else if (this._type == ArgumentType.string && typeof value !== "string")
            throw "Value must be a string";

        if (this._type == ArgumentType.uint16 && (this._value < 0x0 || this.value > 0xFFFF))
            throw "Uint16 must be between 0 and 65535";
        
        this._value = value;
    }

}

export enum ArgumentType {
    uint16,
    float,
    string
}

export const enum BScriptType {
    Action,
    Demo,
    Field
}

enum ActionCommand {
    Start,
    End,
    Loop,
    Pause,
    Jump,
    Print,
    Assert,
    ResetFrame,
    Call,
    CallUserProgram,
    SetUserValue,
    ChangeAction,
    Animation,
    AnimationWithoutSameNumber,
    AnimationByUserValue,
    AnimationFrame,
    WaitAnimation,
    JumpIfAnimationNumber,
    FacialNumber,
    FacialAnimation,
    AnimationWithEclipse,
    AnimationWithoutSameNumberWithEclipse,
    SetOnGround,
    EnableObjectCollision,
    SetObjectCollisionSphere,
    SetObjectCollisionSegment,
    InvincibilityTime,
    HitPoint,
    IsStillAlive,
    IsNotStillAlive,
    IsNoDamage,
    IsResistCapture,
    IsRideable,
    IsDangleable,
    IsGiant,
    EnableNockBack,
    EnableThroughEnemy,
    NoDamage,
    IsTranslucent,
    SetPathBindPolicy,
    SetGroundCheckPolicy,
    SetLookAtPolicy,
    SetRotatePolicy,
    JumpIfActionMode,
    WaitIfActionMode,
    SetActionMode,
    AddActionMode,
    PlayerIfEnemyCaptured,
    PlayerIfNotEnemyCaptured,
    PlayerIfDangling,
    PlayerIfNotDangling,
    PlayerIfOnSlideFloor,
    PlayerIfNotOnSlideFloor,
    PlayerIfReservedContinuousJump,
    PlayerIfNotReservedContinuousJump,
    PlayerIfNotReservedIdleAnimation,
    PlayerStartJump,
    PlayerShootEnemy,
    PlayerStartKazedama,
    PlayerToAngle,
    PlayerStartEffectOfRun,
    EnemyFireBullet,
    SoundEffect,
    SoundEffect2D,
    StartEffect,
    StartEffectWithBoneId,
    StartEffectWithBoneName,
    ShakePlayerCamera,
    Vibration,
    B00ApplyTranslateFromNode,
    B03Animation,
    B05FootEffect,
    B06Animation,
    NumInstructions
}

enum DemoCommand {
    Start,
    End,
    Loop,
    Pause,
    Jump,
    Print,
    Assert,
    ResetFrame,
    EndInit,
    EndViewer,
    EndScene,
    EndDemo,
    InitAddCharacter,
    InitFieldCharacter,
    InitGimmick,
    InitScene,
    InitVoice,
    InitExtendDimmingTimer,
    ChangeScene,
    CreateCharacter,
    CharacterColoration,
    DestroyCharacter,
    ShowCharacter,
    LandscapePauseNode,
    CharacterPauseNode,
    Animation,
    AnimationByName,
    WaitAnimation,
    CharacterEye,
    CharacterMouth,
    StopFacial,
    PauseShadow,
    AnimationScene,
    AnimationCamera,
    CameraPoint,
    CameraSavePoint,
    CameraRestorePoint,
    CameraMove,
    CameraRotateLookat,
    CameraRotate,
    WaitCamera,
    CameraShake,
    Position,
    Rotation,
    RotationDirect,
    Scale,
    Leap,
    BindFloor,
    BindCharacter,
    SpinStart,
    SpinStop,
    PlayEffect,
    PlayEffectByName,
    PlayEffectBone,
    PlayEffectBoneByName,
    StopEffect,
    PlayEffectSet,
    StopEffectSet,
    EnableColorCapture,
    DisableColorCapture,
    EnableLOD,
    DisableLOD,
    EnableSimpleDOF,
    DisableSimpleDOF,
    EnableDOF,
    DisableDOF,
    EnableBloom,
    DisableBloom,
    EnableClampBloom,
    DisableClampBloom,
    EnableFlip,
    DisableFlip,
    ReverseFlip,
    PlaySound,
    StopSound,
    WaitSound,
    PlayStreamSound,
    StopStreamSound,
    SoundListener,
    SoundListenerCamera,
    SoundListenerPosition,
    Play3DSound,
    Play3DSoundPosition,
    SoundSonicSpeed,
    ApplyFX,
    UnapplyFX,
    PlayVoice,
    PlayVoice3D,
    PlayVoice3DPosition,
    StopVoice,
    WaitVoice,
    FadeIn,
    FadeOut,
    WaitFade,
    LogoStart,
    LogoClear,
    WaitLogo,
    MessageOn,
    MessageOff,
    WaitMessage,
    MessageMove,
    MessageSpeed,
    MessageSpeedRate,
    EnableNoneArrowMode,
    TutorialStart,
    TutorialEnd,
    WaitTutorialEnd,
    WaitTutorialDraw,
    OpeningTextStart,
    WaitOpeningText,
    SendEvent,
    SendEventById,
    ZoomBlur,
    ColorTile,
    StartFirework,
    StopFirework,
    SkipFadeColor,
    EnableSkipFade,
    DisableSkipFade,
    EnableSkip,
    DisableSkip,
    TimerStart,
    TimerPrint,
    InitBook,
    BookPage,
    BookName,
    EnablePadCheck,
    DisablePadCheck,
    ResetPadDimmingCount,
    WaitIfKeyOn,
    SetUserValue,
    JumpIfUserValue,
    ResetKlonoaHair,
    SleepKlonoaHair,
    AddScreenEffect,
    umInstructions
}

enum FieldCommand {
    Start,
    End,
    Loop,
    Pause,
    Jump,
    Print,
    Assert,
    ResetFrame,
    Call,
    JumpToNextLabel,
    LoopTo,
    AddCharacterResource,
    DeclareSystem,
    DeclarePortal,
    DeclareGimmick,
    DeclareEnemy,
    DeclareEvent,
    CreateControlPoins,
    SetControlPoint,
    CreateSleepProhibitionPolicies,
    SetSleepProhibitionPolicy,
    SetResetLabel,
    SetPathNumber,
    SetPosition,
    SetPositionDirect,
    SetRotationDirect,
    SetRotateSpeed,
    Animation,
    AnimationWithoutSameNumber,
    WaitAnimation,
    UpdateModelRate,
    IsTranslucent,
    SetPathBindPolicy,
    SetGroundCheckPolicy,
    SetLookAtPolicy,
    SetThroughEnemy,
    UpdateContinuePoint,
    EnableUpdateShadow,
    SetResistCapture,
    EnableWaterSurfaceHeight,
    DisableWaterSurfaceHeight,
    ResetPathPoint,
    CreateSimpleObjects,
    AddSimpleItem,
    AddResidentItem,
    AddSimpleDropItem,
    AddItemToJump,
    WaitLastItemCaught,
    AddSimpleEffect,
    AddScreenEffect,
    DelSimpleEffect,
    Activate,
    Inactivate,
    ActivateWithSealMode,
    InactivateEnemySilent,
    EnableObjectCollision,
    SetObjectCollisionSphere,
    SetObjectCollisionSegment,
    AllowSleep,
    SleepDistance,
    WaitDistanceFromPlayer,
    WaitDistanceFromPlayerXZ,
    JumpIfPlayerComeToPath,
    WaitPlayerComeToPath,
    WaitHitToPlayer,
    WaitNoHitToPlayer,
    WaitHitToThrownEnemy,
    WaitNoHitToThrownEnemy,
    WaitPlayerOnGround,
    JumpIfDistanceFromPlayer,
    WaitIfDistanceFromPlayer,
    JumpIfPathFromPlayer,
    WaitIfPathFromPlayer,
    JumpIfDetailPathFromPlayer,
    WaitIfDetailPathFromPlayer,
    WaitIfDetailPathFromEnemy,
    WaitIfPlayerInsideOfPath,
    JumpIfPlayerInsideOfPath,
    WaitIfPlayerOutsideOfPath,
    JumpIfPlayerOutsideOfPath,
    JumpIfDestroyEnemy,
    PlaySEInArea,
    JumpIfFrameCounter,
    WaitIfFrameCounter,
    JumpIfCharacterID,
    WaitInactivation,
    JumpIfKnockOutCount,
    WaitIfKnockOutCount,
    JumpIfPathOn,
    WaitIfPathOn,
    JumpIfAction,
    WaitIfAction,
    JumpIfEnemyStatus,
    WaitIfEnemyStatus,
    JumpIfPathDistanceFromPlayer,
    WaitBinded,
    WaitRotateAction,
    WaitJumpAction,
    WaitJumpActionInActive,
    WaitJumpActionExceptLand,
    WaitPathAction,
    WaitMove,
    WaitIfIdleAction,
    BindObject,
    ReleaseBindObject,
    TargetToDesappear,
    SetVariableU16,
    AddVariableU16,
    JumpIfVariableU16,
    WaitIfVariableU16,
    SetVariableU16SelfLabel,
    SetVariableGlobal,
    AddVariableGlobal,
    JumpIfVariableGlobal,
    WaitIfVariableGlobal,
    SetVariableGlobalSelfLabel,
    JumpIfCurrentPortal,
    WaitIfCurrentPortal,
    JumpIfRescued,
    Idle,
    Rotation,
    RotationX,
    RotationY,
    RotationZ,
    GimmickEnableEndOfDemoYaw,
    GimmickEnableDomoCast,
    EnableColoration,
    Alpha,
    LookAtPlayer,
    LookAtObject,
    Prowl,
    Move,
    Circle,
    Revolve,
    JumpAction,
    PathLinear,
    GimmickPathLinear,
    PathBSpline,
    PathBSplineJ,
    PathBSplineJPoint,
    StartBullet,
    StartBulletParabola,
    E00SetLookAround,
    E00ManualPlayMotion,
    E00HipSlide,
    E00WaitHipSlide,
    E00HomingPlayer,
    E00JokerStage,
    E00BindLeef,
    E00ToRideLeefAction,
    E00ToEndRideLeefAction,
    E00WaitEndRideLeefAction,
    E00ToRidePoleAction,
    E00WaitEndRidePoleAction,
    E00AddWallCollision,
    E02EnableNockbackToFall,
    E02FollowPlayer,
    E04EnableNockbackToFall,
    E05WaitIfArmorBreak,
    E05JumpIfArmorBreak,
    E07WaitIfArmorBreak,
    E07JumpIfArmorBreak,
    E09ToSpecifiedbe11,
    E09ToSpecifiedbe11Param,
    E09ToSpecifiedbe12,
    E09ToSpecifiedbe12Param,
    E09ReinforcedJumpDescent,
    E09ToSpecifiedbe13,
    E10ToSpecifiedbe13Param,
    E11SetLandPointNum,
    E11HiJumpHeight,
    E11HiJumpRange,
    E12OnlyIdleMotion,
    E12AutoFloatFly,
    E12SERange,
    E12IdleMotionIsRest,
    E17ShakeCamera,
    E17RotSpeed,
    E17WaitFallLimt,
    E17EnableJumpBound,
    E17SpecialB01,
    E17NonBoundLand,
    E19Appear,
    E19WaitReadyAttack,
    E20AttackInterval,
    E20TurnParam,
    E20AttackRate,
    E21SomersaultSpeed,
    E25TurnIdleFrame,
    E27ExplosionLimit,
    E27InActivate,
    E27EnableActiveFall,
    E28Fluctuate,
    E29ActionParam,
    E30AppearTime,
    E30MoveSpeed,
    E30WaitVanish,
    E31AttackParam,
    E33AttackSwingAngle,
    E33NonAttackProwlRate,
    E33ChainMaxRange,
    E35EnableAttackInIdle,
    E35AttackPostureRange,
    E35AttackSpeedRate,
    E33EnableForceStopAttack,
    E33WaitEndAttack,
    E35SetBalloonLifeTime,
    E37SetLandPointNum,
    E37EnableManualLandPoint,
    E37SetLandPoint,
    E37ProwlEndEdge,
    E37Fall,
    E37FallParam,
    E37FollowPlayer,
    E39ChangeAttackMode,
    E39AttackRangeAngle,
    E39ChangeAttackModeByPath,
    E39AutoJump,
    E39NearBulletParam,
    E40SetGuardInterval,
    E40SetJumpHeight,
    E40WaitCarelessAction,
    E40DontMoveProwl,
    E41DefaultAngle,
    E41SetParam,
    E42AttackParam,
    StartBossCamera,
    B00EnableApplyTranslateFromNode,
    B04ResetHeart,
    B06Replace,
    G00WaitSwitchStatus,
    G00Reset,
    G00AlreadyON,
    G00AlreadyONUnlock,
    G00HitToChangeStatusAlways,
    G00UseMissSE,
    G04WaitFall,
    G04AlreadyFall,
    G03BreakFrame,
    G03StartMove,
    G03WaitStop,
    G03FlyCartFrame,
    G03PlayerSeparateFrame,
    G03DestroyedExplosion,
    G03SmallExplosion,
    G03WaitCameraFrame,
    G05SetAmplitude,
    G05SetFactor,
    G06SetFlyMoveParam,
    G08Start,
    G11Param,
    G11GlowUp,
    G11FromDemo,
    G12RopeHangPoint,
    G12WaitRidePlayer,
    G12SetSlope,
    G12EnableGetOff,
    G12HoldHangPoint,
    G12CSetOwner,
    G12CRollParam,
    G13WaitRidePlayer,
    G13WaitMove,
    G13HardBindPlayer,
    G15SetPower,
    G16ToFall,
    G17AlreadyBloom,
    G17WaitBloom,
    G18AlreadyStop,
    G18WaitRidePlayer,
    G18MoveStart,
    G18WaitFinish,
    G18WaitFrame,
    G21SetStopFrame,
    G21SetAdjustCameraOffset,
    G21SetStartPoint,
    G21Activate,
    G21FirstPower,
    G21TurnOnThePower,
    G21WaitFinishTurnOnThePower,
    G21SetFinishTurnOnThePower,
    G24StartOpen,
    G24BToOpen,
    G27DoExec,
    G28BindPlayer,
    G29InactivateWings,
    G30LeefAngle,
    G31SetFallTime,
    G32SetHangPoint,
    G32SetParam,
    G33SetParam,
    G33BackRopeColorRate,
    G34ToBreak,
    G34MakeKey,
    G34JumpIfValidKey,
    G34PathBSpline,
    G36RideTime,
    G43WaitRidePlayer,
    G43PathLinear,
    G44WaitRidePlayer,
    G44PathLinear,
    G45StartRemove,
    G46OpenBarricase,
    G46LimitPos,
    G46AlreadyOpen,
    G49WaitRidePlayer,
    G49NoDummyPathMode,
    G49Setv524Mode,
    G49v524PathLinear,
    G50SetLimitDistance,
    G50SetTime,
    G50StartOn,
    G50StartOff,
    G50StatusOn,
    G51Open,
    G53SetColor,
    G53WaitBroken,
    G54SetColor,
    G54StartOpen,
    G54Opened,
    G55SetColor,
    G55StartOpen,
    G55Opened,
    G56WaitRidePlayer,
    G56PathLinear,
    G56SetActionMode,
    G56ReleaseDummyPath,
    G56SetV621CameraMode,
    G57SetParameter,
    G58SetParameter,
    G59BindPlayer,
    G59WaitRidePlayer,
    G64Param,
    G64Open,
    G64AlreadyOpen,
    G68SetTime,
    G68StartMove,
    G68Moved,
    G78Visible,
    G78WaitDestroy,
    G78WaitDestroyAndAddItem,
    G78WaitDestroyAndAddResidentItem,
    G78WaitDestroyAndAddDropItem,
    G78WaitDestroyAndAddItemToJump,
    G78MakeKey,
    G78JumpIfValidKey,
    G87PowerUp,
    G87PowerDown,
    G87SetParam,
    G87PriorityHigh,
    G89SetParam,
    G89Distance,
    G89EffectOffsetY,
    Gb1SetBurnoutTime,
    Gb1SetLowBurningTime,
    Gb1SetHighBurningTime,
    Gb1SetBlazeHeightLevel,
    GbaSetCloseSpeed,
    GbaStartClose,
    GbcRideableParam,
    GbcDisableRaideablePlayerPath,
    AddItemI12,
    I13AddSimpleItemWithSetSpeed,
    AddItemGoldenMedal,
    J03Open,
    J03Close,
    J03AlreadyOpend,
    J04OpenDown,
    AddWormHole,
    P00ReleaseAttachingModel,
    ShakePlayerCamera,
    SetPortalMoveLength,
    SetPortalEnterTypeTouch,
    ApplyFX,
    UnapplyFX,
    StartStream,
    SetStreamVolume,
    StopStream,
    FadeInStream,
    FadeOutStream,
    PauseStream,
    UnPauseStream,
    SoundEffect,
    SoundEffect3D,
    BlackFadeIn,
    WhiteFadeIn,
    BlackFadeOut,
    WhiteFadeOut,
    WaitFade,
    ColorTile,
    BlurTile,
    ZoomTile,
    EnableColorCapture,
    DisableColorCapture,
    EnableLOD,
    DisableLOD,
    EnableSimpleDOF,
    DisableSimpleDOF,
    EnableDOF,
    DisableDOF,
    EnableBloom,
    DisableBloom,
    EnableClampBloom,
    DisableClampBloom,
    PreLoadField,
    PreLoadDemo,
    AreaJump,
    PortalModelPosture,
    PortalDoNotJump,
    StartDemo,
    WaitDemo,
    JumpIfDemoCleared,
    StartStageTitle,
    WaitStageTitle,
    StartStageClear,
    WaitStageClear,
    EndOfStage,
    JumpIfCountOfDramePieces,
    JumpIfInTimeAttack,
    JumpIfFieldFlipping,
    JumpIfNotFieldFlipping,
    JumpIfNewComer,
    WaitIfKeyOn,
    JumpIfKeyOn,
    WaitIfForbidOperation,
    JumpIfForbidOperation,
    ReservePlayerIdleAction,
    SetEclipseMode,
    WaitIfEclipseMode,
    JumpIfEclipseMode,
    DeclareBossStage,
    StartManualDemo,
    EndManualDemo,
    DeclareTimeAttackForExtra2,
    StartTimeAttackRecord,
    StopTimeAttackRecord,
    VisibleLandscapeNode,
    VisibleLandscapeNodeAll,
    InvisibleLandscapeNode,
    InvisibleLandscapeNodeAll,
    StartManualCamera,
    EndManualCamera,
    CameraPoint,
    CameraPointRoot,
    CameraMove,
    CameraRotateLookat,
    CameraRotate,
    WaitCamera,
    SetFieldCamera,
    GuidepostVisible,
    GuidepostInvisible,
    GuidepostRotationZ,
    GuidepostPosition,
    SetPathNumberOfPlayer,
    StartDebugTimer,
    StopDebugTimer,
    umInstructions
}