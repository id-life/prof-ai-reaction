"use client";

import { configure, getConsoleSink, type LogLevel } from "@logtape/logtape";
import { useEffect } from "react";

const levelAbbreviations: Record<LogLevel, string> = {
  trace: "TRC",
  debug: "DBG",
  info: "INF",
  warning: "WRN",
  error: "ERR",
  fatal: "FTL",
};
const logLevelStyles: Record<LogLevel, string> = {
  trace: "background-color: gray; color: white;",
  debug: "background-color: gray; color: white;",
  info: "background-color: white; color: black;",
  warning: "background-color: orange; color: black;",
  error: "background-color: red; color: white;",
  fatal: "background-color: maroon; color: white;",
};

export function Logger() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      console.log("configuring logtape");
      void configure({
        sinks: {
          console: getConsoleSink({
            formatter: (record) => {
              let msg = "";
              const values: unknown[] = [];
              for (let i = 0; i < record.message.length; i++) {
                if (i % 2 === 0) msg += record.message[i];
                else {
                  msg += "%o";
                  values.push(record.message[i]);
                }
              }
              const date = new Date(record.timestamp);
              const time = `${date.getUTCHours().toString().padStart(2, "0")}:${date
                .getUTCMinutes()
                .toString()
                .padStart(
                  2,
                  "0",
                )}:${date.getUTCSeconds().toString().padStart(2, "0")}.${date
                .getUTCMilliseconds()
                .toString()
                .padStart(3, "0")}`;
              return [
                `%c${time} %c${levelAbbreviations[record.level]}%c %c${record.category.join(
                  "\xb7",
                )} %c${msg}`,
                "color: gray;",
                logLevelStyles[record.level],
                "background-color: default;",
                "color: gray;",
                "color: default;",
                ...values,
                record.properties,
              ];
            },
          }),
        },
        loggers: [
          { category: [], sinks: ["console"], lowestLevel: "trace" },
          {
            category: ["ai-reaction"],
            lowestLevel: "trace",
            sinks: ["console"],
          },
          {
            category: ["logtape", "meta"],
            sinks: ["console"],
            lowestLevel: "warning",
          },
        ],
      })
        .then(() => {
          console.log("logtape configured");
        })
        .catch((error) => {
          console.error("error configuring logtape", error);
        });
    }
  }, []);
  return null;
}
