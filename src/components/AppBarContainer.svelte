<div class="flexy">
    <div class="top-app-bar-container flexor">
        <TopAppBar variant="static">
            <Row>
                <Section>
                    <IconButton class="material-icons" on:click={onMenuClick}>menu</IconButton>
                    <Title>{active}</Title>
                </Section>
                <Section align="end" toolbar>
                    <IconButton href="https://github.com/entriphy/triph_tools" target="_blank" class="material-icons" aria-label="Source code">code</IconButton>
                </Section>
            </Row>
        </TopAppBar>
        <main class="main-content">
            <slot></slot>
        </main>
    </div>
</div>

<script lang="ts">
    import TopAppBar, { Row, Section, Title } from '@smui/top-app-bar';
    import IconButton from '@smui/icon-button';
    import Paper from "@smui/paper";
  
    export let active: string;
    export let onMenuClick: (e: CustomEvent<any>) => any = undefined;
  </script>

<style>
    .top-app-bar-container {
        box-sizing: content-box;
        width: 100%;
        height: 100%;
    
        overflow: auto;
        display: inline-block;
    }
    
    @media (max-width: 480px) {
        .top-app-bar-container {
            margin-right: 0;
        }
    }
    
    .flexy {
        display: flex;
        flex-wrap: wrap;
    }
    
    .flexor {
        display: inline-flex;
        flex-direction: column;
    }

    .main-content {
      overflow: auto;
      box-sizing: content-box;
    }
</style>