<Item on:click={() => open = !open} id="command-{index}">
  <Graphic class="command-index">
    <Text>{index}</Text>
  </Graphic>
  <Text>{command.toString()}</Text>
</Item>
{#if open}
  <Item wrapper>
    <List class="sub-sub-list" nonInteractive>
      {#if Object.keys(command.arguments).length == 0}
        <Item>
          <Text>No arguments.</Text>
        </Item>
      {:else}
        {#each command.arguments as arg, i}
          <Item>
            <Label>{arg.name}</Label>
            <Meta>
              <Textfield invalid={!isValid(arg, values[i])} bind:value={values[i]} label={ArgumentType[arg.type]} on:keypress={keypress} on:focus={() => focus(arg)} on:blur={(e) => blur(e, arg, i)} on:input={(e) => input(e, arg)} />
            </Meta>
          </Item>
        {/each}
      {/if}
    </List>
  </Item>
{/if}

<script lang="ts">
  import List, { Graphic, Label, Item, Meta, Text } from '@smui/list';
  import Textfield from '@smui/textfield';
  import { ArgumentType, BScriptCommand, BScriptCommandArgument } from "./bscript";

  export let command: BScriptCommand;
  export let index: number;
  export let open = false;

  let values = command.arguments.map((v) => v.value.toString());
  let oldArg: BScriptCommandArgument;
  let currentValue: string;

  const focus = (arg: BScriptCommandArgument) => {
    oldArg = arg;
  }

  const blur = (e: CustomEvent, arg: BScriptCommandArgument, i: number) => {
    if (!isValid(arg, values[i])) {
      values[i] = oldArg.value.toString();
    } else {
      command.arguments[i].value = (e.target as any).control.value;
      command = command;
      (e.target as any).control.value = command.arguments[i].value;
    }
  }

  const input = (e: CustomEvent, arg: BScriptCommandArgument) => {
    currentValue = (e.target as HTMLInputElement).value;
  }

  const keypress = (e: CustomEvent) => {
    if ((e as unknown as KeyboardEvent).key === "Enter") {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  }

  function isValid(arg: BScriptCommandArgument, value: string): boolean {
    switch (arg.type) {
      case ArgumentType.uint16:
        let num = parseInt(value);
        if (isNaN(num)) return false;
        if (num < 0 || num > 0xFFFF) return false;
        return true;
      case ArgumentType.float:
        return !isNaN(parseFloat(value));
      case ArgumentType.string:
        return true;
    }
  }
</script>