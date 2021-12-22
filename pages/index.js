import { Heading, Page, Button } from "@shopify/polaris";


function Index(props){
      async function getProducts(){
        const res = await props.axios.post("/api");
        return res;
      }

      async function handleClick() {
        const result = await getProducts();
        console.log(result);
      }

    return (
      <Page>
        <Heading>Shopify app with Node and React </Heading>
        <Button onClick={handleClick}>Get Products</Button>
      </Page>
    );
}

export default Index;