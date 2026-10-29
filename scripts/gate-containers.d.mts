export function gateContainerLabels(run?:string):string[];
export function cleanupGateContainers(run:string,execute?:(args:string[])=>Promise<string>):Promise<{removed:number}>;
