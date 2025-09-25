import { generateComment, writers } from "ai-reaction";

export async function main() {
  const gen = await generateComment(
    {
      currentText: "[Music]",
      historicalText:
        "[Music] this <00:07.719>program <00:08.160>is <00:08.279>brought <00:08.519>to you <00:08.759>by Stanford <00:09.519>University <00:10.480>please <00:10.800>visit <00:11.119>us <00:11.400>at",
      uncommentedText:
        "[Music] this <00:07.719>program <00:08.160>is <00:08.279>brought <00:08.519>to you <00:08.759>by Stanford <00:09.519>University <00:10.480>please <00:10.800>visit <00:11.119>us <00:11.400>at",
      events: [
        {
          id: "RpsdjBYvDRzfr9NS1_A4o",
          type: "summary_point",
          confidence: 0.72,
          timestamp: 7.509,
          duration: 0,
          intensity: 0.4,
          triggers: [],
        },
      ],
      previousComments: [],
    },
    {
      apiKeys: {
        openai: process.env.OPENAI_API_KEY!,
      },
      selectorInstructions: "",
      selectorModel: "gpt-5-mini",
      writers: [
        writers.analytical,
        writers.descriptive,
        writers.emotional,
        writers.humorous,
        writers.predictive,
        writers.summary,
      ],
    },
  );

  for await (const event of gen) {
    if (event.type === "agent_updated_stream_event") {
      console.log(`Agent updated: ${event.agent.name}`);
    } else if (event.type === "run_item_stream_event") {
      console.log(
        `Run item: ${event.name}`,
        JSON.stringify(event.item.toJSON(), null, 2),
      );
    } else if (event.type === "raw_model_stream_event") {
      console.log(`Raw model: `, JSON.stringify(event.data, null, 2));
    }
  }
  await gen.completed;
  console.log(`Final output`, JSON.stringify(gen.finalOutput, null, 2));
}

// Simple CLI entry for local testing
if (import.meta.main) {
  // eslint-disable-next-line unicorn/prefer-top-level-await
  main()
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
