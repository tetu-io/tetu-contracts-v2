import {ISettingsParam} from "tslog";

// tslint:disable-next-line:ban-ts-ignore
// @ts-ignore
const logSettings: ISettingsParam = {
  colorizePrettyLogs: false,
  dateTimeTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  displayLogLevel: false,
  displayLoggerName: false,
  displayFunctionName: false,
  displayFilePath: 'hidden',
}

export default (logSettings);
