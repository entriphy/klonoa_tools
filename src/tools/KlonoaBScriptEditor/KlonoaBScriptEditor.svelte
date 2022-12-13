<div id="klonoa-bscript-editor">
  <Dialog bind:open={dialogOpen} aria-describedby="sheet-content">
    <DialogTitle>Klonoa BScript Editor</DialogTitle>
    <Content id="sheet-content">
      <p>
        Klonoa (Wii) and Klonoa Phantasy Reverie Series both use BScript (bsb) files for entity (<code>action</code>), cutscene (<code>demo</code>), and vision (<code>field</code>) scripts.
        This tool is an editor for those files.
        <br />
        Read more in the <a href="https://github.com/entriphy/KPRS_Mods/wiki/Using-AssetLoader#bscript" target="_blank" rel="noreferrer">AssetLoader documentation</a> for information on how to extract BScript files and mod them in Klonoa Phantasy Reverie Series.
        <br /><br />
        <strong>NOTE:</strong> BScripts from Klonoa (Wii) are currently unsupported, as instruction IDs were slightly changed in Klonoa Phantasy Reverie Series.
      </p>
    </Content>
    <DialogActions>
      <Button>
        <Label>Ok</Label>
      </Button>
    </DialogActions>
  </Dialog>
    {#if bscript === undefined}
      <div class="input-container">
        <img src="https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/1730680/6a0a7d10b25186f204444b721aa9c9b6d691f631.ico" alt="Klonoa BScript Editor" class="icon"/>
        <div class="input-buttons">
          <Button on:click={() => { bscriptType = BScriptType.Action; fileInput.click(); }} variant="raised">
            <Label>Open Action</Label>
          </Button>
          <Button on:click={() => { bscriptType = BScriptType.Demo; fileInput.click(); }} variant="raised">
            <Label>Open Demo</Label>
          </Button>
          <Button on:click={() => { bscriptType = BScriptType.Field; fileInput.click(); }} variant="raised">
            <Label>Open Field</Label>
          </Button>
          <input style="display:none" type="file" accept=".bsb, .bsb.bytes" bind:files bind:this={fileInput} />
        </div>
        <Button on:click={() => dialogOpen = true}>
          <Label>What is this?</Label>
        </Button>
      </div>
    {:else}
      <Button on:click={reset} variant="raised" style="margin-left: 16px; margin-top: 16px;">
        <Label>Reset</Label>
      </Button>
      <Button on:click={download} variant="raised" style="margin-left: 16px; margin-top: 16px;">
        <Label>Download</Label>
      </Button>

      <!-- Labels -->
      <List class="demo-list">
        <Item on:click={() => labelsOpen = !labelsOpen}>
          <Graphic class="material-icons">label</Graphic>
          <Text>Labels ({bscript.data.labelIndexCount})</Text>
        </Item>
        {#if labelsOpen}
          <Item wrapper>
            <List class="sub-list">
              {#each bscript.data.labelIndices as label, i}
              <Item on:click={() => animateScroll.scrollTo({element: document.getElementById("command-" + label), container: document.getElementById("klonoa-bscript-editor")})}>
                <Graphic class="command-index">
                  <Text>{i}</Text>
                </Graphic>
                <Text>{bscript.data.commands[label].instructionString} @ {label}</Text>
              </Item>
              {/each}
            </List>
          </Item>
        {/if}

        <!-- Action Labels -->
        <Item on:click={() => actionLabelsOpen = !actionLabelsOpen}>
          <Graphic class="material-icons">label</Graphic>
          <Text>Action Labels ({bscript.data.actionLabelIndexCount})</Text>
        </Item>
        {#if actionLabelsOpen}
          <Item wrapper>
            <List class="sub-list">
              {#each bscript.data.actionLabelIndices as actionLabel, i}
              <Item on:click={() => { animateScroll.scrollTo({element: document.getElementById("command-" + actionLabel), container: document.getElementById("klonoa-bscript-editor")}); }}>
                <Graphic class="command-index">
                  <Text>{i}</Text>
                </Graphic>
                <Text>{bscript.data.commands[actionLabel].instructionString} @ {actionLabel}</Text>
              </Item>
              {/each}
            </List>
          </Item>
        {/if}

        <!-- Search Strings -->
        <Item on:click={() => searchStringsOpen = !searchStringsOpen}>
          <Graphic class="material-icons">search</Graphic>
          <Text>Search Strings ({bscript.data.searchStringCount})</Text>
        </Item>
        {#if searchStringsOpen}
          <Item wrapper>
            <List class="sub-list">
              {#each bscript.data.searchStrings as searchString, i}
              <Item on:click={() => animateScroll.scrollTo({element: document.getElementById("command-" + searchString), container: document.getElementById("klonoa-bscript-editor")})}>
                <Graphic class="command-index">
                  <Text>{i}</Text>
                </Graphic>
                <Text>{`"${bscript.data.searchStringsStrings[i]}"`} ({bscript.data.searchStringToCommand(searchString).instructionString}) @ 0x{(bscript.data.commandsOffset + bscript.data.searchStrings[i]).toString(16).toUpperCase()} -> 0x{bscript.data.searchStringsOffsets[i].toString(16).toUpperCase()}</Text>
              </Item>
              {/each}
            </List>
          </Item>
        {/if}

        <!-- Commands -->
        <Item on:click={() => commandsOpen = !commandsOpen}>
          <Graphic class="material-icons">settings</Graphic>
          <Text>Commands ({bscript.data.commandCount})</Text>
        </Item>
        {#if commandsOpen}
          <Item wrapper>
            <List class="sub-list">
              {#each bscript.data.commands as command, i}
                <CommandListItem {command} index={i} />
              {/each}
            </List>
          </Item>
        {/if}
      </List>
    {/if}

    <Snackbar bind:this={snackbarError} class="snackbar-error">
      <SnackbarLabel>Unable to open BScript file: {error}</SnackbarLabel>
    </Snackbar>
</div>

<script lang="ts">
  import Button, { Label } from '@smui/button';
  import Dialog, { Content, Actions as DialogActions, Title as DialogTitle } from '@smui/dialog';
  import List, { Graphic, Item, Text } from '@smui/list';
  import Snackbar, { Label as SnackbarLabel, Actions } from '@smui/snackbar';
  import { BScript, BScriptType } from "./bscript";
  import CommandListItem from './CommandListItem.svelte';
  import { animateScroll } from 'svelte-scrollto-element';

  let files: FileList;
  let filename: string;
  let fileInput: HTMLInputElement;
  let bscriptType: BScriptType;
  let bscript: BScript;
  let snackbarError: Snackbar;
  let error: any;
  let dialogOpen = false;

  let labelsOpen = false;
  let actionLabelsOpen = false;
  let searchStringsOpen = false;
  let commandsOpen = false;

  $: if (files) {
    const reader = new FileReader();
    reader.readAsArrayBuffer(files[0]);
    filename = files[0].name;
    files = undefined;
    reader.onload = () => {
      try {
        bscript = new BScript(bscriptType, reader.result as ArrayBuffer);
        console.log(bscript);
      } catch (e) {
        error = e;
        snackbarError.open();
        console.error(e);
        filename = undefined;
      }
    }
  }

  const download = (e: Event) => {
    var blob = new Blob([new Uint8Array(bscript.deserialize())]);
    var link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  }

  const reset = (e: Event) => {
    bscript = undefined;
    filename = undefined;
    labelsOpen = false;
    actionLabelsOpen = false;
    searchStringsOpen = false;
    commandsOpen = false;
  }
</script>

<style lang="scss">
  #klonoa-bscript-editor {
    overflow: auto;
    height: calc(100vh - 64px);
    position: relative;
  }

  .input-container {
    position: absolute;
    margin: 0;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }

  .input-buttons {
    padding: 16px;
  }

  .icon {
    border-radius: 50%;
    width: 128px;
  }

  * :global(.sub-list) {
    padding-left: 20px;
  }

  * :global(.sub-sub-list) {
    padding-left: 64px;
    padding-top: 14px;
    max-width: 400px;
  }
</style>