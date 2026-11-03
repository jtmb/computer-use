import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { LLM, LLMEvent } from "../../src/index.js"
import { OpenResponses } from "../../src/protocols/open-responses.js"
import { configure } from "../../src/providers/openai-compatible-responses.js"
import { LLMClient } from "../../src/route.js"
import { it } from "../lib/effect.js"
import { fixedResponse } from "../lib/http.js"
import { sseEvents } from "../lib/sse.js"

const model = configure({
  apiKey: "test-key",
  baseURL: "https://responses.example.test/v1",
  providerOptions: { reasoningEffort: "configured-effort", variant: "configured-variant" },
}).model("requested-model")
const request = LLM.request({
  model,
  prompt: "private request prompt",
  providerOptions: { reasoningEffort: "request-effort", variant: "request-variant" },
})
const generate = (...events: OpenResponses.Event[]) =>
  LLMClient.generate(request).pipe(Effect.provide(fixedResponse(sseEvents(...events))))

describe("Open Responses final model observation", () => {
  it.effect("keeps response-reported model and effort separate from request selection", () =>
    Effect.gen(function* () {
      const response = yield* generate({
        type: "response.completed",
        response: {
          id: "resp_1",
          service_tier: "priority",
          model: "future/vendor-model:preview",
          reasoning: { effort: "experimental-ultra-v3", requested_effort: "private-config" },
          prompt: "private response prompt",
          headers: { authorization: "private response header" },
          body: "private response body",
        },
      })
      const finish = response.events.find(LLMEvent.is.finish)
      const stepFinish = response.events.find(LLMEvent.is.stepFinish)

      expect(response.events.filter(LLMEvent.is.finish)).toHaveLength(1)
      expect(response.events.slice(-2).map((event) => event.type)).toEqual(["step-finish", "finish"])
      expect(finish?.reason).toEqual({ normalized: "stop", raw: undefined })
      expect(finish?.usage).toBeUndefined()
      expect(finish?.providerMetadata?.["openai-compatible"]).toEqual({
        responseId: "resp_1",
        serviceTier: "priority",
        modelObservation: {
          source: "open-responses",
          model: "future/vendor-model:preview",
          reasoningEffort: "experimental-ultra-v3",
        },
      })
      expect(stepFinish?.providerMetadata).toEqual(finish?.providerMetadata)
    }),
  )

  it.effect("observes incomplete final metadata without requiring a response id", () =>
    Effect.gen(function* () {
      const response = yield* generate({
        type: "response.incomplete",
        response: {
          model: "future-model-without-id",
          reasoning: { effort: "future-effort-without-id" },
          incomplete_details: { reason: "max_output_tokens" },
          usage: { input_tokens: 40, output_tokens: 9, total_tokens: 49 },
        },
      })
      const finish = response.events.find(LLMEvent.is.finish)

      expect(finish?.reason).toEqual({ normalized: "length", raw: "max_output_tokens" })
      expect(finish?.usage).toMatchObject({ inputTokens: 40, outputTokens: 9, totalTokens: 49 })
      expect(finish?.providerMetadata?.["openai-compatible"]).toEqual({
        responseId: undefined,
        serviceTier: undefined,
        modelObservation: {
          source: "open-responses",
          model: "future-model-without-id",
          reasoningEffort: "future-effort-without-id",
        },
      })
    }),
  )

  it.effect("does not promote response.created fields or request/config values", () =>
    Effect.gen(function* () {
      const response = yield* generate(
        {
          type: "response.created",
          response: { id: "resp_created", model: "created-only-model", reasoning: { effort: "created-only-effort" } },
        },
        { type: "response.completed", response: { id: "resp_final", service_tier: "standard" } },
      )
      const finish = response.events.find(LLMEvent.is.finish)

      expect(finish?.providerMetadata?.["openai-compatible"]).toEqual({
        responseId: "resp_final",
        serviceTier: "standard",
      })
    }),
  )

  ;[
    {
      name: "omits malformed model and effort values",
      model: { id: "not-a-model-identifier" },
      reasoning: { effort: ["not-an-effort-identifier"] },
      observation: undefined,
    },
    {
      name: "omits only a whitespace model and keeps a valid future effort",
      model: "model name",
      reasoning: { effort: "future-effort" },
      observation: { source: "open-responses", reasoningEffort: "future-effort" },
    },
    {
      name: "omits only an unsafe effort and keeps a valid future model",
      model: "future-model-v9",
      reasoning: { effort: "\u001b[31mhigh" },
      observation: { source: "open-responses", model: "future-model-v9" },
    },
    {
      name: "omits unicode format controls",
      model: "model\u202ename",
      reasoning: { effort: "high" },
      observation: { source: "open-responses", reasoningEffort: "high" },
    },
    {
      name: "omits overlong identifiers",
      model: "m".repeat(257),
      reasoning: { effort: "e".repeat(65) },
      observation: undefined,
    },
    {
      name: "accepts identifiers at their length bounds",
      model: "m".repeat(256),
      reasoning: { effort: "e".repeat(64) },
      observation: {
        source: "open-responses",
        model: "m".repeat(256),
        reasoningEffort: "e".repeat(64),
      },
    },
  ].forEach((fixture) => {
    it.effect(fixture.name, () =>
      Effect.gen(function* () {
        const response = yield* generate({
          type: "response.completed",
          response: {
            id: "resp_invalid_observation",
            model: fixture.model,
            reasoning: fixture.reasoning,
            unrelated_body_field: "must-not-be-copied",
          },
        })
        const finish = response.events.find(LLMEvent.is.finish)

        expect(finish).toBeDefined()
        expect(finish?.providerMetadata?.["openai-compatible"]).toEqual({
          responseId: "resp_invalid_observation",
          serviceTier: undefined,
          ...(fixture.observation === undefined ? {} : { modelObservation: fixture.observation }),
        })
      }),
    )
  })
})
