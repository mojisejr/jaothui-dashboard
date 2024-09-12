export {};

declare global {
  interface Window {
    upload_image_dialog: {
      showModal: () => void;
    };
    upload_microchip_dialog: {
      showModal: () => void;
    };
    upload_name_dialog: {
      showModal: () => void;
    };
    origin_dialog: {
      showModal: () => void;
    };
    // upload_color_dialog: {
    //   showModal: () => void;
    // };
    color_dialog: {
      showModal: () => void;
    };
    upload_detail_dialog: {
      showModal: () => void;
    };
    upload_sex_dialog: {
      showModal: () => void;
    };
    upload_birthday_dialog: {
      showModal: () => void;
    };
    upload_height_dialog: {
      showModal: () => void;
    };
    upload_certNo_dialog: {
      showModal: () => void;
    };
    upload_dna_dialog: {
      showModal: () => void;
    };
    upload_rarity_dialog: {
      showModal: () => void;
    };
    upload_parent_dialog: {
      showModal: () => void;
    };
  }
}
