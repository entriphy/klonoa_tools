<div class="drawer-container">
    <Drawer variant="dismissible" bind:open>
        <Header>
            <DrawerTitle>Triph Tools</DrawerTitle>
            <Subtitle>idk</Subtitle>
        </Header>
        <Content>
            <List>
                <Item href="javascript:void(0)" on:click={()=> setActive('Klonoa BScript Editor')} activated={active ===
                    'Klonoa BScript Editor'}>
                    <Text>Klonoa BScript Editor</Text>
                </Item>
                <Item href="javascript:void(0)" on:click={()=> setActive('Klonoa 2 Cutscene Editor')} activated={active
                    === 'Klonoa 2 Cutscene Editor'}>
                    <Text>Klonoa 2 Cutscene Editor</Text>
                </Item>
            </List>
        </Content>
    </Drawer>

    <AppContent class="app-content">
        <AppBarContainer active={active} onMenuClick={()=> open = !open}>
            <slot></slot>
        </AppBarContainer>
    </AppContent>
</div>

<script lang="ts">
    import Drawer, {
        AppContent,
        Content,
        Header,
        Title as DrawerTitle,
        Subtitle,
    } from '@smui/drawer';
    import List, {
        Item,
        Text
    } from '@smui/list';
    import AppBarContainer from './AppBarContainer.svelte';

    let open = true;
    export let active = 'Klonoa BScript Editor';

    function setActive(value: string) {
        active = value;
    }
</script>

<style>
    .drawer-container {
      display: flex;
      height: 100%;
      overflow: hidden;
      z-index: 0;
    }
  
    * :global(.app-content) {
      flex: auto;
      overflow: auto;
      position: relative;
      flex-grow: 1;
    }
</style>