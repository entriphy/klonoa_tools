<DrawerContainer bind:active={active}>
    <!-- <slot></slot> -->
    {#if active === "Klonoa BScript Editor"}
        <KlonoaBScriptEditor />
    {:else if active === "Klonoa 2 Cutscene Editor"}
        <Klonoa2CutsceneEditor />
    {/if}
</DrawerContainer>
 
<script lang="ts">
    import DrawerContainer from "./DrawerContainer.svelte";
    import KlonoaBScriptEditor from "../tools/KlonoaBScriptEditor/KlonoaBScriptEditor.svelte";
    import Klonoa2CutsceneEditor from "../tools/Klonoa2CutsceneEditor/Klonoa2CutsceneEditor.svelte";

    let active = "Klonoa BScript Editor"
</script>