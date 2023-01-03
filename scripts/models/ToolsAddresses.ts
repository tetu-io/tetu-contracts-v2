export class ToolsAddresses {

  public readonly liquidator: string;
  public readonly converter: string;
  public readonly multicall: string;


  constructor(liquidator: string, converter: string, multicall: string) {
    this.liquidator = liquidator;
    this.converter = converter;
    this.multicall = multicall;
  }
}
